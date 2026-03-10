import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import * as db from "../db.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PRESETS_DIR = join(__dirname, "../../../shared/presets")

const GenerationParamsSchema = z.object({
  max_tokens: z.number().int(),
  temperature: z.number(),
  top_k: z.number().int(),
  top_p: z.number(),
  min_p: z.number(),
  typical_p: z.number(),
  top_n_sigma: z.number(),
  repeat_penalty: z.number(),
  repeat_last_n: z.number().int(),
  presence_penalty: z.number(),
  frequency_penalty: z.number(),
  mirostat: z.number().int().min(0).max(2),
  mirostat_tau: z.number(),
  mirostat_eta: z.number(),
  dynatemp_range: z.number(),
  dynatemp_exponent: z.number(),
  dry_multiplier: z.number(),
  dry_base: z.number(),
  dry_allowed_length: z.number().int(),
  dry_penalty_last_n: z.number().int(),
  xtc_probability: z.number(),
  xtc_threshold: z.number(),
  seed: z.number().int(),
})

const ConnectorSchema = z.object({
  type: z.enum(["koboldcpp"]),
  url: z.string().min(1),
  api_key: z.string(),
})

const SettingsUpdateSchema = z
  .object({
    theme: z.enum(["default", "amoled"]),
    design: z.enum(["classic", "roboto"]),
    textJustify: z.boolean(),
    colorScheme: z.enum(["gold", "emerald", "sapphire", "crimson"]),
    connector: ConnectorSchema.partial(),
    generation: GenerationParamsSchema.partial(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one setting is required" })

const settings = new Hono()

settings.get("/", (c) => c.json(db.getSettings()))

settings.put("/", zValidator("json", SettingsUpdateSchema), (c) => {
  const update = c.req.valid("json")
  const current = db.getSettings()
  const next: db.SettingsState = {
    ...current,
    ...(update.theme !== undefined && { theme: update.theme }),
    ...(update.design !== undefined && { design: update.design }),
    ...(update.textJustify !== undefined && { textJustify: update.textJustify }),
    ...(update.colorScheme !== undefined && { colorScheme: update.colorScheme }),
    ...(update.connector && { connector: { ...current.connector, ...update.connector } }),
    ...(update.generation && { generation: { ...current.generation, ...update.generation } }),
  }
  db.updateSettings(next)
  return c.json(next)
})

settings.get("/presets", (c) => {
  const files = readdirSync(PRESETS_DIR).filter((f) => f.endsWith(".json")).sort()
  const presets = files.map((f) => JSON.parse(readFileSync(join(PRESETS_DIR, f), "utf-8")))
  return c.json(presets)
})

export default settings
