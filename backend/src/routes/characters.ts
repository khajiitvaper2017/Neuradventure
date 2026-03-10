import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import * as db from "../db.js"
import { CreateCharacterRequestSchema, MainCharacterStateSchema, UpdateCharacterRequestSchema } from "../models.js"

const characters = new Hono()

characters.get("/", (c) => {
  const rows = db.listCharacters()
  return c.json(
    rows.map((r) => ({
      id: r.id,
      name: r.name,
      gender: r.gender,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }))
  )
})

characters.get("/:id", (c) => {
  const id = Number(c.req.param("id"))
  const row = db.getCharacter(id)
  if (!row) return c.json({ error: "Character not found" }, 404)
  return c.json({ ...row, state: JSON.parse(row.state_json) })
})

characters.post("/", zValidator("json", CreateCharacterRequestSchema), (c) => {
  const body = c.req.valid("json")
  const state = {
    name: body.name,
    gender: body.gender,
    appearance: body.appearance,
    personality_traits: body.personality_traits,
    custom_traits: body.custom_traits,
    inventory: [],
  }
  const id = db.createCharacter(body.name, body.gender, state)
  return c.json({ id }, 201)
})

characters.put("/:id", zValidator("json", UpdateCharacterRequestSchema), (c) => {
  const id = Number(c.req.param("id"))
  const row = db.getCharacter(id)
  if (!row) return c.json({ error: "Character not found" }, 404)
  const current = MainCharacterStateSchema.parse(JSON.parse(row.state_json))
  const body = c.req.valid("json")
  const updated = {
    ...current,
    ...(body.name && { name: body.name }),
    ...(body.gender && { gender: body.gender }),
    ...(body.appearance && { appearance: body.appearance }),
    ...(body.personality_traits && { personality_traits: body.personality_traits }),
    ...(body.custom_traits && { custom_traits: body.custom_traits }),
  }
  db.updateCharacter(id, updated.name, updated.gender, updated)
  return c.json({ ok: true })
})

characters.delete("/:id", (c) => {
  const id = Number(c.req.param("id"))
  db.deleteCharacter(id)
  return c.json({ ok: true })
})

characters.get("/:id/export", (c) => {
  const id = Number(c.req.param("id"))
  const row = db.getCharacter(id)
  if (!row) return c.json({ error: "Character not found" }, 404)
  const data = JSON.stringify({ ...row, state: JSON.parse(row.state_json) }, null, 2)
  return new Response(data, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="character-${id}.json"`,
    },
  })
})

characters.post(
  "/import",
  zValidator(
    "json",
    z.object({
      name: z.string(),
      gender: z.string(),
      state: MainCharacterStateSchema,
    })
  ),
  (c) => {
    const body = c.req.valid("json")
    const id = db.createCharacter(body.name, body.gender, body.state)
    return c.json({ id }, 201)
  }
)

export default characters
