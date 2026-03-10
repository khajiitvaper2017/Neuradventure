import { serve } from "@hono/node-server"
import { serveStatic } from "@hono/node-server/serve-static"
import { Hono } from "hono"
import { cors } from "hono/cors"
import { logger } from "hono/logger"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { initDb } from "./db.js"
import characters from "./routes/characters.js"
import stories from "./routes/stories.js"
import turns from "./routes/turns.js"
import { generateCharacter, generateStory } from "./llm.js"

initDb()
console.log("Database initialized")

const app = new Hono()

app.use(logger())
app.use("/api/*", cors({ origin: ["http://localhost:5173", "http://localhost:4173"] }))

app.route("/api/stories", stories)
app.route("/api/characters", characters)
app.route("/api/turns", turns)

app.post("/api/generate/character",
  zValidator("json", z.object({ description: z.string().min(1) })),
  async (c) => {
    const { description } = c.req.valid("json")
    try {
      return c.json(await generateCharacter(description))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  }
)

app.post("/api/generate/story",
  zValidator("json", z.object({
    description: z.string().min(1),
    character_name: z.string(),
    character_traits: z.array(z.string()),
  })),
  async (c) => {
    const { description, character_name, character_traits } = c.req.valid("json")
    try {
      return c.json(await generateStory(description, character_name, character_traits))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  }
)

// Serve built frontend in production
app.use("/*", serveStatic({ root: "../frontend/dist" }))

const PORT = 3001

serve({ fetch: app.fetch, port: PORT }, () => {
  console.log(`Neuradventure backend running at http://localhost:${PORT}`)
  console.log(`API docs: http://localhost:${PORT}/api/stories`)
})

export default app
