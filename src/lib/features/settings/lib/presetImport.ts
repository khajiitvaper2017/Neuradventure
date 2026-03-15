import type { GenerationParams } from "@/shared/api-types"

export type ImportedPreset = {
  name: string
  description: string
  params: GenerationParams
}

export function filenameToPresetName(file: File): string {
  const name = file.name.replace(/\.[^.]+$/, "").trim()
  return name || "Imported Preset"
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (typeof value === "string") {
    const n = Number(value.trim())
    return Number.isFinite(n) ? n : undefined
  }
  return undefined
}

function asInt(value: unknown): number | undefined {
  const n = asNumber(value)
  return n === undefined ? undefined : Math.trunc(n)
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

export function coercePresetFromJson(
  raw: unknown,
  fallbackName: string,
  base: GenerationParams,
): ImportedPreset | null {
  if (isRecord(raw) && typeof raw.name === "string" && isRecord(raw.params)) {
    const params = { ...base, ...(raw.params as Partial<GenerationParams>) }
    return {
      name: raw.name.trim() || fallbackName,
      description: typeof raw.description === "string" ? raw.description : "",
      params,
    }
  }

  if (!isRecord(raw)) return null

  const temp = asNumber(raw.temp)
  const repPen = asNumber(raw.rep_pen)
  const isSillyTavernish = temp !== undefined || repPen !== undefined || asNumber(raw.top_p) !== undefined
  if (!isSillyTavernish) return null

  const params: GenerationParams = { ...base }

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
