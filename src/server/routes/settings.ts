import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import * as db from "../db.js"
import { getCtxLimitCached } from "../llm.js"
import { desc } from "../schemas/field-descriptions.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PRESETS_DIR = join(__dirname, "../../../shared/presets")

const GenerationParamsSchema = z.object({
  max_tokens: z.number().int().describe(desc("settings.generation.max_tokens")),
  ctx_limit: z.number().int().describe(desc("settings.generation.ctx_limit")),
  temperature: z.number().describe(desc("settings.generation.temperature")),
  top_k: z.number().int().describe(desc("settings.generation.top_k")),
  top_p: z.number().describe(desc("settings.generation.top_p")),
  min_p: z.number().describe(desc("settings.generation.min_p")),
  typical_p: z.number().describe(desc("settings.generation.typical_p")),
  top_n_sigma: z.number().describe(desc("settings.generation.top_n_sigma")),
  repeat_penalty: z.number().describe(desc("settings.generation.repeat_penalty")),
  repeat_last_n: z.number().int().describe(desc("settings.generation.repeat_last_n")),
  presence_penalty: z.number().describe(desc("settings.generation.presence_penalty")),
  frequency_penalty: z.number().describe(desc("settings.generation.frequency_penalty")),
  mirostat: z.number().int().min(0).max(2).describe(desc("settings.generation.mirostat")),
  mirostat_tau: z.number().describe(desc("settings.generation.mirostat_tau")),
  mirostat_eta: z.number().describe(desc("settings.generation.mirostat_eta")),
  dynatemp_range: z.number().describe(desc("settings.generation.dynatemp_range")),
  dynatemp_exponent: z.number().describe(desc("settings.generation.dynatemp_exponent")),
  dry_multiplier: z.number().describe(desc("settings.generation.dry_multiplier")),
  dry_base: z.number().describe(desc("settings.generation.dry_base")),
  dry_allowed_length: z.number().int().describe(desc("settings.generation.dry_allowed_length")),
  dry_penalty_last_n: z.number().int().describe(desc("settings.generation.dry_penalty_last_n")),
  xtc_probability: z.number().describe(desc("settings.generation.xtc_probability")),
  xtc_threshold: z.number().describe(desc("settings.generation.xtc_threshold")),
  seed: z.number().int().describe(desc("settings.generation.seed")),
})

const ConnectorSchema = z.object({
  type: z.enum(["koboldcpp"]).describe(desc("settings.connector.type")),
  url: z.string().min(1).describe(desc("settings.connector.url")),
  api_key: z.string().describe(desc("settings.connector.api_key")),
})

const SettingsUpdateSchema = z
  .object({
    theme: z.enum(["default", "amoled"]).describe(desc("settings.update.theme")),
    design: z.enum(["classic", "roboto"]).describe(desc("settings.update.design")),
    textJustify: z.boolean().describe(desc("settings.update.textJustify")),
    colorScheme: z.enum(["gold", "emerald", "sapphire", "crimson"]).describe(desc("settings.update.colorScheme")),
    connector: ConnectorSchema.partial().describe(desc("settings.update.connector")),
    generation: GenerationParamsSchema.partial().describe(desc("settings.update.generation")),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { message: "At least one setting is required" })

const settings = new Hono()

settings.get("/", (c) => {
  const settings = db.getSettings()
  const ctx_limit_detected = getCtxLimitCached()
  return c.json({ ...settings, ctx_limit_detected })
})

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
  const files = readdirSync(PRESETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()
  const presets = files.map((f) => JSON.parse(readFileSync(join(PRESETS_DIR, f), "utf-8")))
  return c.json(presets)
})

export default settings
