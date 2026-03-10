import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import * as db from "../db.js"

const ThemeSchema = z.enum(["default", "amoled"])
const DesignSchema = z.enum(["classic", "roboto"])

const SettingsSchema = z.object({
  theme: ThemeSchema,
  design: DesignSchema,
})

const SettingsUpdateSchema = SettingsSchema.partial().refine(
  (value) => value.theme !== undefined || value.design !== undefined,
  { message: "At least one setting is required" }
)

const settings = new Hono()

settings.get("/", (c) => c.json(db.getSettings()))

settings.put("/", zValidator("json", SettingsUpdateSchema), (c) => {
  const update = c.req.valid("json")
  const current = db.getSettings()
  const next = { ...current, ...update }
  db.updateSettings(next)
  return c.json(next)
})

export default settings
