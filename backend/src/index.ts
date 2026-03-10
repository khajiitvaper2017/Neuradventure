import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import os from "node:os"
import { initDb } from "./db.js"
import characters from "./routes/characters.js"
import stories from "./routes/stories.js"
import turns from "./routes/turns.js"
import generate from "./routes/generate.js"
import settings from "./routes/settings.js"

initDb()
console.log("Database initialized")

const app = new Hono()
const isDev = process.env.NODE_ENV !== "production"

app.use(logger())
app.use(
  "/api/*",
  cors({
    origin: isDev ? "*" : ["http://localhost:5173", "http://localhost:4173"],
  })
)

app.get("/api/health", (c) => c.json({ ok: true }))

app.route("/api/stories", stories)
app.route("/api/characters", characters)
app.route("/api/turns", turns)
app.route("/api/generate", generate)
app.route("/api/settings", settings)

// Serve built frontend in production
app.use("/*", serveStatic({ root: "../frontend/dist" }))

const PORT = 3001
const HOST = process.env.HOST ?? "0.0.0.0"

serve({ fetch: app.fetch, port: PORT, hostname: HOST }, () => {
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
})

export default app
