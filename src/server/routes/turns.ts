import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import * as db from "../db.js"
import {
  CancelLastRequestSchema,
  RegenerateLastRequestSchema,
  SelectTurnVariantRequestSchema,
  TakeTurnRequestSchema,
  UndoCancelRequestSchema,
  UpdateTurnRequestSchema,
  WorldStateStoredSchema,
} from "../models.js"
import {
  buildTurnResultFromRow,
  cancelLastTurn,
  processTurn,
  regenerateLastTurn,
  selectTurnVariant,
  undoCancelLastTurn,
} from "../game.js"

const turns = new Hono()
const inFlight = new Map<string, ReturnType<typeof processTurn>>()

turns.post("/", zValidator("json", TakeTurnRequestSchema), async (c) => {
  const body = c.req.valid("json")
  const story = db.getStory(body.story_id)
  if (!story) return c.json({ error: "Story not found" }, 404)

  try {
    const requestId = body.request_id?.trim() || undefined
    if (requestId) {
      const existing = db.getTurnByRequestId(requestId)
      if (existing) return c.json(buildTurnResultFromRow(existing))
      const inflight = inFlight.get(requestId)
      if (inflight) return c.json(await inflight)
    }

    const task = processTurn(body.story_id, body.player_input, body.action_mode, requestId)
    if (requestId) inFlight.set(requestId, task)
    try {
      const result = await task
      return c.json(result)
    } finally {
      if (requestId) inFlight.delete(requestId)
    }
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
      action_mode: t.action_mode,
      active_variant_id: t.active_variant_id,
      player_input: t.player_input,
      narrative_text: t.narrative_text,
      world: WorldStateStoredSchema.parse(JSON.parse(t.world_snapshot_json)),
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

turns.delete("/:id", (c) => {
  const id = Number(c.req.param("id"))
  const deleted = db.deleteTurn(id)
  if (!deleted) return c.json({ error: "Turn not found" }, 404)
  return c.json({ ok: true })
})

turns.post("/cancel-last", zValidator("json", CancelLastRequestSchema), (c) => {
  const body = c.req.valid("json")
  try {
    const result = cancelLastTurn(body.story_id)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("not found")) return c.json({ error: message }, 404)
    return c.json({ error: message }, 400)
  }
})

turns.post("/undo-cancel", zValidator("json", UndoCancelRequestSchema), (c) => {
  const body = c.req.valid("json")
  try {
    const result = undoCancelLastTurn(body.story_id)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("not found")) return c.json({ error: message }, 404)
    return c.json({ error: message }, 400)
  }
})

turns.post("/regenerate-last", zValidator("json", RegenerateLastRequestSchema), async (c) => {
  const body = c.req.valid("json")
  try {
    const result = await regenerateLastTurn(body.story_id, body.action_mode)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return c.json({ error: "KoboldCpp is not running. Please start KoboldCpp first." }, 503)
    }
    if (message.includes("not found")) return c.json({ error: message }, 404)
    console.error("LLM error:", err)
    return c.json({ error: "LLM generation failed: " + message }, 500)
  }
})

turns.get("/:id/variants", (c) => {
  const turnId = Number(c.req.param("id"))
  const turn = db.getTurn(turnId)
  if (!turn) return c.json({ error: "Turn not found" }, 404)
  const variants = db.listTurnVariants(turnId)
  return c.json({
    active_variant_id: turn.active_variant_id,
    variants: variants.map((v) => ({
      id: v.id,
      variant_index: v.variant_index,
      narrative_text: v.narrative_text,
      created_at: v.created_at,
    })),
  })
})

turns.post("/:id/variants/select", zValidator("json", SelectTurnVariantRequestSchema), (c) => {
  const turnId = Number(c.req.param("id"))
  const body = c.req.valid("json")
  try {
    const result = selectTurnVariant(turnId, body.variant_id)
    return c.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("not found")) return c.json({ error: message }, 404)
    return c.json({ error: message }, 400)
  }
})

export default turns
