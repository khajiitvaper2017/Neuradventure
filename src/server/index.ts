import { getRequestListener } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import os from "node:os"
import { createServer as createHttpServer } from "node:http"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { WebSocketServer } from "ws"
import { initDb } from "./core/db.js"
import { initCtxLimit } from "./llm/index.js"
import { initFileLogger } from "./utils/file-logger.js"
import stories from "./api/stories.js"
import turns from "./api/turns.js"
import generate from "./api/generate.js"
import settings from "./api/settings.js"
import chats from "./api/chats.js"
import promptHistory from "./api/prompt-history.js"
import { attachStreamWebSocketServer } from "./streaming/ws.js"

initFileLogger()
initDb()
console.log("Database initialized")
initCtxLimit().catch((err) => {
  console.error("[ctx_limit] Failed to fetch context limit from Kobold", err)
})

const app = new Hono()
const isDev = process.env.NODE_ENV !== "production"
const serverDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(serverDir, "../..")
const indexHtml = resolve(repoRoot, "index.html")

app.use(logger())
app.use(
  "/api/*",
  cors({
    origin: isDev ? "*" : ["http://localhost:5173", "http://localhost:4173"],
  }),
)

app.get("/api/health", (c) => c.json({ ok: true }))

app.route("/api/stories", stories)
app.route("/api/turns", turns)
app.route("/api/generate", generate)
app.route("/api/settings", settings)
app.route("/api/chats", chats)
app.route("/api/prompt-history", promptHistory)

const PORT = Number.parseInt(process.env.PORT ?? "3001", 10) || 3001
const HOST = process.env.HOST ?? "0.0.0.0"

const logServerStart = () => {
  console.log(`Neuradventure backend running at http://${HOST}:${PORT}`)
  console.log(`API docs: http://localhost:${PORT}/api/stories`)
  const lanIps = Object.values(os.networkInterfaces())
    .flatMap((nets) => nets ?? [])
    .filter((net) => net.family === "IPv4" && !net.internal)
    .map((net) => net.address)
  if (lanIps.length) {
    console.log(`LAN access:`)
    for (const ip of lanIps) {
      console.log(`  http://${ip}:${PORT}`)
    }
  }
}

const startServer = async () => {
  const honoListener = getRequestListener(app.fetch)

  // Serve built frontend in production
  if (!isDev) {
    app.use("/*", serveStatic({ root: "./dist" }))
  }

  let vite: Awaited<ReturnType<(typeof import("vite"))["createServer"]>> | null = null

  const server = createHttpServer(async (req, res) => {
    const url = req.url ?? "/"

    if (isDev && !url.startsWith("/api")) {
      try {
        await new Promise<void>((resolve, reject) => {
          if (!vite) {
            resolve()
            return
          }
          vite.middlewares(req, res, (err?: Error) => {
            if (err) {
              reject(err)
              return
            }
            resolve()
          })
        })

        if (res.writableEnded) {
          return
        }

        if (!vite) {
          res.statusCode = 500
          res.end("Vite server not initialized")
          return
        }

        const template = await readFile(indexHtml, "utf-8")
        const html = await vite.transformIndexHtml(url, template)
        res.statusCode = 200
        res.setHeader("Content-Type", "text/html")
        res.end(html)
      } catch (err) {
        if (vite && err instanceof Error) vite.ssrFixStacktrace(err)
        console.error(err)
        res.statusCode = 500
        res.end("Internal Server Error")
      }
      return
    }

    await honoListener(req, res)
  })

  if (isDev) {
    process.env.NA_VITE_MIDDLEWARE = "1"
    const { createServer: createViteServer } = await import("vite")
    vite = await createViteServer({
      root: repoRoot,
      server: { middlewareMode: { server }, hmr: { server } },
      appType: "custom",
    })
  }

  // NOTE: Do not attach `ws` directly to the shared HTTP server with `path`,
  // because `ws` will abort *all* non-matching upgrade requests with a 400.
  // That breaks Vite's HMR socket at `/?token=...` when running in dev.
  const wss = new WebSocketServer({ noServer: true })
  wss.on("error", (err) => {
    console.error("[ws] Stream server error", err)
  })
  attachStreamWebSocketServer(wss)

  server.on("upgrade", (req, socket, head) => {
    const url = req.url ?? ""
    const index = url.indexOf("?")
    const pathname = index === -1 ? url : url.slice(0, index)
    if (pathname !== "/api/stream") return

    wss.handleUpgrade(req, socket, head, (ws) => {
      wss.emit("connection", ws, req)
    })
  })

  server.on("error", (err) => {
    console.error("[server] HTTP server error", err)
  })

  server.listen(PORT, HOST, logServerStart)
}

startServer().catch((err) => {
  console.error("Failed to start server", err)
  process.exit(1)
})

export default app
