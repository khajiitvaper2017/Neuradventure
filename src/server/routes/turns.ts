import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import * as db from "../db.js"
import { TakeTurnRequestSchema, UpdateTurnRequestSchema } from "../models.js"
import { processTurn } from "../game.js"

const turns = new Hono()

turns.post("/", zValidator("json", TakeTurnRequestSchema), async (c) => {
  const body = c.req.valid("json")
  const story = db.getStory(body.story_id)
  if (!story) return c.json({ error: "Story not found" }, 404)

  try {
    const result = await processTurn(body.story_id, body.player_input, body.action_mode)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return c.json({ error: "KoboldCpp is not running. Please start KoboldCpp first." }, 503)
    }
    console.error("LLM error:", err)
    return c.json({ error: "LLM generation failed: " + message }, 500)
  }
})

turns.get("/:storyId", (c) => {
  const storyId = Number(c.req.param("storyId"))
  const rows = db.getTurnsForStory(storyId)
  return c.json(
    rows.map((t) => ({
      id: t.id,
      turn_number: t.turn_number,
      player_input: t.player_input,
      narrative_text: t.narrative_text,
      created_at: t.created_at,
    })),
  )
})

turns.put("/:id", zValidator("json", UpdateTurnRequestSchema), (c) => {
  const id = Number(c.req.param("id"))
  const body = c.req.valid("json")
  if (body.player_input === undefined && body.narrative_text === undefined) {
    return c.json({ error: "Nothing to update" }, 400)
  }
  const updated = db.updateTurn(id, body)
  if (!updated) return c.json({ error: "Turn not found" }, 404)
  return c.json({ ok: true })
})

export default turns
