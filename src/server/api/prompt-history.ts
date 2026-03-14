import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import * as db from "../core/db.js"

const KindSchema = z.enum(["story", "character", "chat"])

const promptHistory = new Hono()

promptHistory.get("/:kind", (c) => {
  const kind = KindSchema.safeParse(c.req.param("kind"))
  if (!kind.success) return c.json({ error: "Invalid kind" }, 400)
  const limitRaw = c.req.query("limit")
  const limit = limitRaw ? Number(limitRaw) : undefined
  const items = db.listPromptHistory(kind.data, limit)
  return c.json({ items })
})

promptHistory.post(
  "/:kind",
  zValidator("json", z.object({ prompt: z.string().min(1), limit: z.number().int().min(1).max(50).optional() })),
  (c) => {
    const kind = KindSchema.safeParse(c.req.param("kind"))
    if (!kind.success) return c.json({ error: "Invalid kind" }, 400)
    const body = c.req.valid("json")
    const items = db.upsertPromptHistory(kind.data, body.prompt, body.limit)
    return c.json({ items })
  },
)

promptHistory.post(
  "/:kind/bulk",
  zValidator(
    "json",
    z.object({
      prompts: z.array(z.string().min(1)).min(1),
      limit: z.number().int().min(1).max(50).optional(),
    }),
  ),
  (c) => {
    const kind = KindSchema.safeParse(c.req.param("kind"))
    if (!kind.success) return c.json({ error: "Invalid kind" }, 400)
    const body = c.req.valid("json")
    const items = db.upsertPromptHistoryMany(kind.data, body.prompts, body.limit)
    return c.json({ items })
  },
)

promptHistory.delete(
  "/:kind",
  zValidator("json", z.object({ prompt: z.string().min(1), limit: z.number().int().min(1).max(50).optional() })),
  (c) => {
    const kind = KindSchema.safeParse(c.req.param("kind"))
    if (!kind.success) return c.json({ error: "Invalid kind" }, 400)
    const body = c.req.valid("json")
    const items = db.deletePromptHistory(kind.data, body.prompt, body.limit)
    return c.json({ items })
  },
)

export default promptHistory
