import { getRequestListener, serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import os from "node:os"
import { createServer as createHttpServer } from "node:http"
import { readFile } from "node:fs/promises"
import { fileURLToPath } from "node:url"
import { dirname, resolve } from "node:path"
import { initDb } from "./core/db.js"
import { initCtxLimit } from "./llm/index.js"
import stories from "./api/stories.js"
import turns from "./api/turns.js"
import generate from "./api/generate.js"
import settings from "./api/settings.js"

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

const PORT = 3001
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
  if (isDev) {
    const { createServer: createViteServer } = await import("vite")
    const honoListener = getRequestListener(app.fetch)
    let vite: Awaited<ReturnType<typeof createViteServer>> | null = null
    const server = createHttpServer(async (req, res) => {
      const url = req.url ?? "/"
      if (url.startsWith("/api")) {
        await honoListener(req, res)
        return
      }

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

        if (res.writableEnded || !vite) {
          return
        }

        const template = await readFile(indexHtml, "utf-8")
        const html = await vite.transformIndexHtml(url, template)
        res.statusCode = 200
        res.setHeader("Content-Type", "text/html")
        res.end(html)
      } catch (err) {
        if (vite && err instanceof Error) {
          vite.ssrFixStacktrace(err)
        }
        console.error(err)
        res.statusCode = 500
        res.end("Internal Server Error")
      }
    })

    vite = await createViteServer({
      root: repoRoot,
      server: { middlewareMode: true, hmr: { server } },
      appType: "custom",
    })

    server.listen(PORT, HOST, logServerStart)
    return
  }

  // Serve built frontend in production
  app.use("/*", serveStatic({ root: "./dist" }))
  serve({ fetch: app.fetch, port: PORT, hostname: HOST }, logServerStart)
}

startServer().catch((err) => {
  console.error("Failed to start server", err)
  process.exit(1)
})

export default app
