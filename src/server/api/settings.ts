import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { readdirSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import * as db from "../core/db.js"
import { DEFAULT_GENERATION } from "../core/db/settings.js"
import { getCtxLimitCached, initCtxLimit } from "../llm/index.js"
import { getCachedUpstreamModels } from "../llm/models.js"
import { StoryModulesSchema } from "../schemas/story-modules.js"
import { badRequest } from "./handlers/http.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const PRESETS_DIR = join(__dirname, "../../../shared/config/presets")

const GenerationParamsSchema = z.object({
  max_tokens: z.number().int(),
  ctx_limit: z.number().int(),
  temperature: z.number(),
  top_k: z.number().int(),
  top_a: z.number(),
  top_p: z.number(),
  min_p: z.number(),
  typical_p: z.number(),
  tfs: z.number(),
  top_n_sigma: z.number(),
  repeat_penalty: z.number(),
  repeat_last_n: z.number().int(),
  rep_pen_slope: z.number(),
  presence_penalty: z.number(),
  frequency_penalty: z.number(),
  mirostat: z.number().int().min(0).max(2),
  mirostat_tau: z.number(),
  mirostat_eta: z.number(),
  dynatemp_range: z.number(),
  dynatemp_exponent: z.number(),
  smoothing_factor: z.number(),
  smoothing_curve: z.number(),
  adaptive_target: z.number(),
  adaptive_decay: z.number(),
  dry_multiplier: z.number(),
  dry_base: z.number(),
  dry_allowed_length: z.number().int(),
  dry_penalty_last_n: z.number().int(),
  dry_sequence_breakers: z.array(z.string()),
  xtc_probability: z.number(),
  xtc_threshold: z.number(),
  ban_eos_token: z.boolean(),
  sampler_order: z.array(z.number().int()),
  banned_tokens: z.array(z.string()),
  logit_bias: z.record(z.string(), z.number()),
  render_special: z.boolean(),
  seed: z.number().int(),
})

const ConnectorSchema = z.object({
  type: z.enum(["koboldcpp", "openrouter"]),
  url: z.string().min(1),
  api_key: z.string().optional(),
  api_keys: z
    .object({
      koboldcpp: z.string(),
      openrouter: z.string(),
    })
    .partial()
    .optional(),
  model: z.string().min(1).optional(),
})

const ConnectorFullSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("koboldcpp"),
    url: z.string().min(1),
    api_keys: z.object({
      koboldcpp: z.string().min(1),
      openrouter: z.string(),
    }),
  }),
  z.object({
    type: z.literal("openrouter"),
    url: z.string().min(1),
    api_keys: z.object({
      koboldcpp: z.string(),
      openrouter: z.string().min(1),
    }),
    model: z.string().min(1),
  }),
])

const SamplerPresetSchema = z.object({
  id: z.number().int().optional(),
  name: z.string().min(1),
  description: z.string().optional().default(""),
  params: GenerationParamsSchema,
})

const SamplerPresetUpsertSchema = SamplerPresetSchema.omit({ id: true })

const SettingsUpdateSchema = z
  .object({
    theme: z.enum(["default", "amoled"]),
    design: z.enum(["classic", "roboto"]),
    textJustify: z.boolean(),
    colorScheme: z.enum(["gold", "emerald", "sapphire", "crimson"]),
    streamingEnabled: z.boolean(),
    authorNoteEnabled: z.boolean(),
    defaultAuthorNote: z.string(),
    defaultAuthorNoteDepth: z.number().int().min(0).max(100),
    storyDefaults: StoryModulesSchema.partial(),
    connector: ConnectorSchema.partial(),
    generation: GenerationParamsSchema.partial(),
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, { error: "At least one setting is required" })

const PromptConfigNameSchema = z.enum(db.PROMPT_CONFIG_KEYS as unknown as [string, ...string[]])
const PromptConfigUpdateSchema = z.object({
  config_json: z.string().min(1),
})

const settings = new Hono()

settings.get("/", (c) => {
  const settings = db.getSettings()
  const ctx_limit_detected = getCtxLimitCached()
  return c.json({ ...settings, ctx_limit_detected })
})

settings.get("/models", async (c) => {
  const url = new URL(c.req.url)
  const q = (url.searchParams.get("q") ?? "").trim()
  const limitRaw = url.searchParams.get("limit")
  const limitParsed = limitRaw ? Number(limitRaw) : NaN
  const limit = Number.isFinite(limitParsed) ? Math.max(1, Math.min(500, Math.floor(limitParsed))) : 200

  try {
    const { connector } = db.getSettings()
    const models = await getCachedUpstreamModels(connector)
    const needle = q.toLowerCase()
    const filtered = needle
      ? models.filter((m) => m.id.toLowerCase().includes(needle) || (m.name ?? "").toLowerCase().includes(needle))
      : models
    return c.json({ models: filtered.slice(0, limit) })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to fetch models"
    return badRequest(c, message)
  }
})

settings.put("/", zValidator("json", SettingsUpdateSchema), (c) => {
  const update = c.req.valid("json")
  const current = db.getSettings()

  const nextConnectorRaw = update.connector
    ? ({
        ...current.connector,
        ...update.connector,
        api_keys: {
          ...current.connector.api_keys,
          ...(update.connector.api_keys ?? {}),
        },
      } as unknown)
    : current.connector
  let nextConnector: db.LLMConnector
  try {
    nextConnector = ConnectorFullSchema.parse(nextConnectorRaw) as db.LLMConnector
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid connector settings"
    return badRequest(c, message)
  }

  const next: db.SettingsState = {
    ...current,
    ...(update.theme !== undefined && { theme: update.theme }),
    ...(update.design !== undefined && { design: update.design }),
    ...(update.textJustify !== undefined && { textJustify: update.textJustify }),
    ...(update.colorScheme !== undefined && { colorScheme: update.colorScheme }),
    ...(update.streamingEnabled !== undefined && { streamingEnabled: update.streamingEnabled }),
    ...(update.authorNoteEnabled !== undefined && { authorNoteEnabled: update.authorNoteEnabled }),
    ...(update.defaultAuthorNote !== undefined && { defaultAuthorNote: update.defaultAuthorNote }),
    ...(update.defaultAuthorNoteDepth !== undefined && { defaultAuthorNoteDepth: update.defaultAuthorNoteDepth }),
    ...(update.storyDefaults && {
      storyDefaults: { ...current.storyDefaults, ...update.storyDefaults },
    }),
    connector: nextConnector,
    ...(update.generation && { generation: { ...current.generation, ...update.generation } }),
  }

  db.updateSettings(next)
  initCtxLimit().catch((err) => {
    console.error("[ctx_limit] Failed to refresh context limit", err)
  })
  return c.json(next)
})

settings.get("/prompts", (c) => {
  const rows = db.listPromptConfigFiles()
  const out = rows.map((r) => {
    try {
      const parsed = JSON.parse(r.config_json) as unknown
      return { ...r, config_json: JSON.stringify(parsed, null, 2) }
    } catch {
      return r
    }
  })
  return c.json(out)
})

settings.put(
  "/prompts/:name",
  zValidator(
    "param",
    z.object({
      name: PromptConfigNameSchema,
    }),
  ),
  zValidator("json", PromptConfigUpdateSchema),
  (c) => {
    const { name } = c.req.valid("param")
    const { config_json } = c.req.valid("json")
    try {
      const row = db.updatePromptConfigFile(name, config_json)
      const parsed = JSON.parse(row.config_json) as unknown
      return c.json({ ...row, config_json: JSON.stringify(parsed, null, 2) })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to update prompt config"
      return badRequest(c, message)
    }
  },
)

settings.post(
  "/prompts/:name/reset",
  zValidator(
    "param",
    z.object({
      name: PromptConfigNameSchema,
    }),
  ),
  (c) => {
    const { name } = c.req.valid("param")
    try {
      const row = db.resetPromptConfigFile(name)
      const parsed = JSON.parse(row.config_json) as unknown
      return c.json({ ...row, config_json: JSON.stringify(parsed, null, 2) })
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to reset prompt config"
      return badRequest(c, message)
    }
  },
)

settings.post("/prompts/reset", (c) => {
  try {
    const reset = db.resetAllPromptConfigFiles()
    return c.json({ ok: true, reset })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to reset prompt configs"
    return badRequest(c, message)
  }
})

settings.get("/presets", (c) => {
  const files = readdirSync(PRESETS_DIR)
    .filter((f) => f.endsWith(".json"))
    .sort()

  const builtins: Array<z.infer<typeof SamplerPresetSchema>> = []
  for (const f of files) {
    try {
      const raw = JSON.parse(readFileSync(join(PRESETS_DIR, f), "utf-8")) as unknown
      const preset = coerceSamplerPreset(raw, f.replace(/\.json$/i, ""))
      if (preset) builtins.push(preset)
    } catch {
      // Ignore invalid preset files.
    }
  }

  const custom = db.listSamplerPresets()

  const merged = [...builtins]
  for (const p of custom) {
    const idx = merged.findIndex((x) => x.name === p.name)
    if (idx >= 0) merged[idx] = p
    else merged.push(p)
  }

  return c.json(merged)
})

settings.post("/presets", zValidator("json", SamplerPresetUpsertSchema), (c) => {
  const preset = c.req.valid("json")
  const saved = db.upsertSamplerPreset({
    name: preset.name,
    description: preset.description,
    params: preset.params,
  })
  return c.json(saved)
})

settings.delete("/presets/:id", (c) => {
  const raw = c.req.param("id")
  const id = Number(raw)
  if (!Number.isFinite(id) || !Number.isInteger(id) || id <= 0) return c.json({ ok: false }, 400)
  const ok = db.deleteSamplerPreset(id)
  if (!ok) return c.json({ ok: false }, 404)
  return c.json({ ok: true })
})

export default settings

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const parsed = Number(value.trim())
    return Number.isFinite(parsed) ? parsed : undefined
  }
  return undefined
}

function asInt(value: unknown): number | undefined {
  const n = asNumber(value)
  if (n === undefined) return undefined
  const i = Math.trunc(n)
  return Number.isFinite(i) ? i : undefined
}

function asBool(value: unknown): boolean | undefined {
  if (typeof value === "boolean") return value
  if (value === 0) return false
  if (value === 1) return true
  if (typeof value === "string") {
    const v = value.trim().toLowerCase()
    if (v === "true") return true
    if (v === "false") return false
  }
  return undefined
}

function parseStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown
      if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed
    } catch {
      // ignore
    }
  }
  return undefined
}

function parseLogitBias(value: unknown): Record<string, number> | undefined {
  if (isRecord(value)) {
    const out: Record<string, number> = {}
    for (const [k, v] of Object.entries(value)) {
      const n = asNumber(v)
      if (n === undefined) continue
      out[k] = n
    }
    return out
  }
  if (Array.isArray(value)) {
    const out: Record<string, number> = {}
    for (const item of value) {
      if (!isRecord(item)) continue
      const id = item.id ?? item.token_id ?? item.tokenId ?? item.key
      const bias = item.bias ?? item.value
      const idStr = typeof id === "string" ? id : typeof id === "number" ? String(Math.trunc(id)) : null
      const n = asNumber(bias)
      if (!idStr || n === undefined) continue
      out[idStr] = n
    }
    return out
  }
  return undefined
}

function coerceSamplerPreset(raw: unknown, fallbackName: string): z.infer<typeof SamplerPresetSchema> | null {
  const parsed = SamplerPresetSchema.safeParse(raw)
  if (parsed.success) return parsed.data

  if (!isRecord(raw)) return null
  if (raw.name && typeof raw.name === "string" && raw.params && isRecord(raw.params)) {
    const withDefaults = {
      ...raw,
      description: typeof raw.description === "string" ? raw.description : "",
      id: undefined,
    }
    const parsed2 = SamplerPresetSchema.safeParse(withDefaults)
    return parsed2.success ? parsed2.data : null
  }

  // SillyTavern/Kobold-style flat preset
  const temp = asNumber(raw.temp)
  const repPen = asNumber(raw.rep_pen)
  const isSillyTavernish = temp !== undefined || repPen !== undefined || asNumber(raw.top_p) !== undefined
  if (!isSillyTavernish) return null

  const params: db.GenerationParams = { ...DEFAULT_GENERATION }

  const genamt = asInt(raw.genamt)
  if (genamt !== undefined && genamt > 0) params.max_tokens = genamt
  const maxTokens = asInt(raw.max_tokens)
  if (maxTokens !== undefined && maxTokens > 0) params.max_tokens = maxTokens

  if (temp !== undefined) params.temperature = temp
  const topK = asInt(raw.top_k)
  if (topK !== undefined) params.top_k = topK
  const topP = asNumber(raw.top_p)
  if (topP !== undefined) params.top_p = topP
  const topA = asNumber(raw.top_a)
  if (topA !== undefined) params.top_a = topA
  const minP = asNumber(raw.min_p)
  if (minP !== undefined) params.min_p = minP

  const typical = asNumber(raw.typical_p ?? raw.typical)
  if (typical !== undefined) params.typical_p = typical
  const tfs = asNumber(raw.tfs)
  if (tfs !== undefined) params.tfs = tfs
  const nsigma = asNumber(raw.nsigma)
  if (nsigma !== undefined) params.top_n_sigma = nsigma <= 0 ? -1.0 : nsigma

  if (repPen !== undefined) params.repeat_penalty = repPen
  const repPenRange = asInt(raw.rep_pen_range)
  if (repPenRange !== undefined) params.repeat_last_n = repPenRange
  const repPenSlope = asNumber(raw.rep_pen_slope)
  if (repPenSlope !== undefined) params.rep_pen_slope = repPenSlope

  const presence = asNumber(raw.presence_pen ?? raw.presence_penalty)
  if (presence !== undefined) params.presence_penalty = presence
  const freq = asNumber(raw.freq_pen ?? raw.frequency_penalty)
  if (freq !== undefined) params.frequency_penalty = freq

  const mirostatMode = asInt(raw.mirostat_mode ?? raw.mirostat)
  if (mirostatMode !== undefined) params.mirostat = mirostatMode
  const miroTau = asNumber(raw.mirostat_tau)
  if (miroTau !== undefined) params.mirostat_tau = miroTau
  const miroEta = asNumber(raw.mirostat_eta)
  if (miroEta !== undefined) params.mirostat_eta = miroEta

  const dynRange = asNumber(raw.dynatemp_range)
  if (dynRange !== undefined) {
    params.dynatemp_range = dynRange
  } else {
    const dynatemp = asBool(raw.dynatemp)
    const minTemp = asNumber(raw.min_temp)
    const maxTemp = asNumber(raw.max_temp)
    if (dynatemp && minTemp !== undefined && maxTemp !== undefined)
      params.dynatemp_range = Math.max(0.0, maxTemp - minTemp)
    if (dynatemp === false) params.dynatemp_range = 0.0
  }
  const dynExp = asNumber(raw.dynatemp_exponent)
  if (dynExp !== undefined) params.dynatemp_exponent = dynExp

  const smoothingFactor = asNumber(raw.smoothing_factor)
  if (smoothingFactor !== undefined) params.smoothing_factor = smoothingFactor
  const smoothingCurve = asNumber(raw.smoothing_curve)
  if (smoothingCurve !== undefined) params.smoothing_curve = smoothingCurve

  const adaptiveTarget = asNumber(raw.adaptive_target)
  if (adaptiveTarget !== undefined) params.adaptive_target = adaptiveTarget
  const adaptiveDecay = asNumber(raw.adaptive_decay)
  if (adaptiveDecay !== undefined) params.adaptive_decay = adaptiveDecay

  const dryMult = asNumber(raw.dry_multiplier)
  if (dryMult !== undefined) params.dry_multiplier = dryMult
  const dryBase = asNumber(raw.dry_base)
  if (dryBase !== undefined) params.dry_base = dryBase
  const dryAllowed = asInt(raw.dry_allowed_length)
  if (dryAllowed !== undefined) params.dry_allowed_length = dryAllowed
  const dryPenalty = asInt(raw.dry_penalty_last_n)
  if (dryPenalty !== undefined) params.dry_penalty_last_n = dryPenalty
  const breakers = parseStringArray(raw.dry_sequence_breakers)
  if (breakers) params.dry_sequence_breakers = breakers

  const xtcProb = asNumber(raw.xtc_probability)
  if (xtcProb !== undefined) params.xtc_probability = xtcProb
  const xtcThr = asNumber(raw.xtc_threshold)
  if (xtcThr !== undefined) params.xtc_threshold = xtcThr

  const banEos = asBool(raw.ban_eos_token)
  if (banEos !== undefined) params.ban_eos_token = banEos
  const renderSpecial = asBool(raw.render_special)
  if (renderSpecial !== undefined) params.render_special = renderSpecial

  const order = raw.sampler_order
  if (Array.isArray(order) && order.every((v) => typeof v === "number" && Number.isFinite(v))) {
    params.sampler_order = order.map((n) => Math.trunc(n))
  }

  const bannedTokens = parseStringArray(raw.banned_tokens ?? raw.banned_strings)
  if (bannedTokens) params.banned_tokens = bannedTokens

  const logitBias = parseLogitBias(raw.logit_bias)
  if (logitBias) params.logit_bias = logitBias

  const seed = asInt(raw.seed ?? raw.sampler_seed)
  if (seed !== undefined) params.seed = seed

  return {
    name: typeof raw.preset === "string" && raw.preset.trim() ? raw.preset.trim() : fallbackName,
    description: typeof raw.description === "string" ? raw.description : "Imported preset",
    params,
  }
}
