import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { initDb } from "./db.js"
import characters from "./routes/characters.js"
import stories from "./routes/stories.js"
import turns from "./routes/turns.js"

initDb()
console.log("Database initialized")

const app = new Hono()

app.use(logger())
app.use("/api/*", cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }))

app.route("/api/stories", stories)
app.route("/api/characters", characters)
app.route("/api/turns", turns)

// Serve built frontend in production
app.use("/*", serveStatic({ root: "../frontend/dist" }))

const PORT = 3001

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Neuradventure backend running at http://localhost:${PORT}`)
  console.log(`API docs: http://localhost:${PORT}/api/stories`)
})

export default app
