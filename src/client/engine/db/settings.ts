import { getDb } from "./connection.js"
import type {
  GenerationParams,
  KoboldCppConnector,
  LLMConnector,
  OpenRouterConnector,
  SettingsState,
  TimeoutSettings,
} from "../../../../shared/api-types.js"
import { DEFAULT_STORY_MODULES, normalizeStoryModules } from "../schemas/story-modules.js"

export const DEFAULT_GENERATION: GenerationParams = {
  max_tokens: 1500,
  ctx_limit: 0,
  temperature: 0.85,
  top_k: 40,
  top_a: 0.0,
  top_p: 0.95,
  min_p: 0.05,
  typical_p: 1.0,
  tfs: 1.0,
  top_n_sigma: -1.0,
  repeat_penalty: 1.0,
  repeat_last_n: 320,
  rep_pen_slope: 1.0,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
  mirostat: 0,
  mirostat_tau: 5.0,
  mirostat_eta: 0.1,
  dynatemp_range: 0.0,
  dynatemp_exponent: 1.0,
  smoothing_factor: 0.0,
  smoothing_curve: 1.0,
  adaptive_target: -1.0,
  adaptive_decay: 0.9,
  dry_multiplier: 0.0,
  dry_base: 1.75,
  dry_allowed_length: 2,
  dry_penalty_last_n: -1,
  dry_sequence_breakers: ["\n", ":", '"', "*"],
  xtc_probability: 0.0,
  xtc_threshold: 0.1,
  ban_eos_token: false,
  sampler_order: [6, 0, 1, 3, 4, 2, 5],
  banned_tokens: [],
  logit_bias: {},
  render_special: false,
  seed: -1,
}

const DEFAULT_KOBOLD_CONNECTOR: KoboldCppConnector = {
  type: "koboldcpp",
  url: "http://localhost:5001/v1",
  api_keys: {
    koboldcpp: "kobold",
    openrouter: "",
  },
}

const DEFAULT_OPENROUTER_CONNECTOR: OpenRouterConnector = {
  type: "openrouter",
  url: "https://openrouter.ai/api/v1",
  api_keys: {
    koboldcpp: "kobold",
    openrouter: "",
  },
  model: "openrouter/free",
}

export const DEFAULT_SETTINGS: SettingsState = {
  theme: "default",
  design: "classic",
  textJustify: true,
  colorScheme: "gold",
  streamingEnabled: false,
  sectionFormat: "markdown",
  timeouts: {
    llmRequestMs: 10 * 60 * 1000,
    upstreamFetchMs: 15 * 1000,
    streamSessionTtlMs: 45 * 1000,
    modelsCacheTtlMs: 5 * 60 * 1000,
    supportedParamsCacheTtlMs: 5 * 60 * 1000,
    ctxLimitCacheTtlMs: 5 * 60 * 1000,
    pendingRequestTtlMs: 10 * 60 * 1000,
    uiErrorToastMs: 4000,
    uiQuietNoticeMs: 3500,
    uiFlashMs: 900,
    uiKeyboardScrollDelayMs: 120,
    uiResumePendingTurnDelayMs: 500,
    fieldWatchDebounceMs: 50,
  },
  authorNoteEnabled: true,
  defaultAuthorNote: "Remember the instructions you were given at the beginning of this chat.",
  defaultAuthorNoteDepth: 4,
  defaultAuthorNotePosition: 1,
  defaultAuthorNoteInterval: 1,
  defaultAuthorNoteRole: 0,
  defaultAuthorNoteEmbedState: false,
  storyDefaults: { ...DEFAULT_STORY_MODULES },
  connector: {
    ...DEFAULT_KOBOLD_CONNECTOR,
  },
  generation: { ...DEFAULT_GENERATION },
}

function coerceConnector(raw: unknown): LLMConnector {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_KOBOLD_CONNECTOR }
  const obj = raw as Record<string, unknown>
  const type = obj.type
  const url = typeof obj.url === "string" && obj.url.trim() ? obj.url : undefined

  const legacyKey = typeof obj.api_key === "string" ? obj.api_key : undefined
  const apiKeysRaw = obj.api_keys
  const apiKeys =
    apiKeysRaw && typeof apiKeysRaw === "object"
      ? {
          koboldcpp:
            typeof (apiKeysRaw as Record<string, unknown>).koboldcpp === "string"
              ? String((apiKeysRaw as Record<string, unknown>).koboldcpp)
              : undefined,
          openrouter:
            typeof (apiKeysRaw as Record<string, unknown>).openrouter === "string"
              ? String((apiKeysRaw as Record<string, unknown>).openrouter)
              : undefined,
        }
      : { koboldcpp: undefined, openrouter: undefined }
  const mergedApiKeys = {
    koboldcpp: apiKeys.koboldcpp ?? DEFAULT_KOBOLD_CONNECTOR.api_keys.koboldcpp,
    openrouter: apiKeys.openrouter ?? DEFAULT_KOBOLD_CONNECTOR.api_keys.openrouter,
  }

  if (type === "openrouter") {
    const model = typeof obj.model === "string" && obj.model.trim() ? obj.model : undefined
    if (legacyKey !== undefined) mergedApiKeys.openrouter = legacyKey
    return {
      ...DEFAULT_OPENROUTER_CONNECTOR,
      ...(url ? { url } : {}),
      api_keys: mergedApiKeys,
      ...(model ? { model } : {}),
    }
  }

  if (legacyKey !== undefined) mergedApiKeys.koboldcpp = legacyKey
  return {
    ...DEFAULT_KOBOLD_CONNECTOR,
    ...(url ? { url } : {}),
    api_keys: mergedApiKeys,
  }
}

function coerceSectionFormat(raw: unknown): SettingsState["sectionFormat"] {
  if (
    raw === "xml" ||
    raw === "markdown" ||
    raw === "equals" ||
    raw === "bbcode" ||
    raw === "colon" ||
    raw === "none"
  ) {
    return raw
  }
  return DEFAULT_SETTINGS.sectionFormat
}

function coerceTimeoutSettings(raw: unknown): TimeoutSettings {
  const base = DEFAULT_SETTINGS.timeouts
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { ...base }
  const obj = raw as Record<string, unknown>

  const asInt = (v: unknown): number | null => {
    const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN
    if (!Number.isFinite(n)) return null
    return Math.trunc(n)
  }

  const pick = (key: keyof TimeoutSettings, min: number, max: number): number => {
    const parsed = asInt(obj[key])
    if (parsed === null) return base[key]
    return Math.max(min, Math.min(max, parsed))
  }

  return {
    llmRequestMs: pick("llmRequestMs", 1000, 60 * 60 * 1000),
    upstreamFetchMs: pick("upstreamFetchMs", 500, 5 * 60 * 1000),
    streamSessionTtlMs: pick("streamSessionTtlMs", 1000, 10 * 60 * 1000),
    modelsCacheTtlMs: pick("modelsCacheTtlMs", 1000, 60 * 60 * 1000),
    supportedParamsCacheTtlMs: pick("supportedParamsCacheTtlMs", 1000, 60 * 60 * 1000),
    ctxLimitCacheTtlMs: pick("ctxLimitCacheTtlMs", 1000, 60 * 60 * 1000),
    pendingRequestTtlMs: pick("pendingRequestTtlMs", 1000, 24 * 60 * 60 * 1000),
    uiErrorToastMs: pick("uiErrorToastMs", 0, 60 * 1000),
    uiQuietNoticeMs: pick("uiQuietNoticeMs", 0, 60 * 1000),
    uiFlashMs: pick("uiFlashMs", 0, 30 * 1000),
    uiKeyboardScrollDelayMs: pick("uiKeyboardScrollDelayMs", 0, 5000),
    uiResumePendingTurnDelayMs: pick("uiResumePendingTurnDelayMs", 0, 30 * 1000),
    fieldWatchDebounceMs: pick("fieldWatchDebounceMs", 0, 5000),
  }
}

export function getSettings(): SettingsState {
  const row = getDb().prepare("SELECT settings_json FROM settings WHERE id = 1").get() as
    | { settings_json: string }
    | undefined
  if (!row) return DEFAULT_SETTINGS
  try {
    const stored = JSON.parse(row.settings_json) as Partial<SettingsState>
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      storyDefaults: normalizeStoryModules(stored.storyDefaults, DEFAULT_SETTINGS.storyDefaults),
      connector: coerceConnector(stored.connector),
      generation: { ...DEFAULT_SETTINGS.generation, ...(stored.generation ?? {}) },
      sectionFormat: coerceSectionFormat(stored.sectionFormat),
      timeouts: coerceTimeoutSettings(stored.timeouts),
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function updateSettings(settings: SettingsState): void {
  getDb()
    .prepare("UPDATE settings SET settings_json = ?, updated_at = datetime('now') WHERE id = 1")
    .run(JSON.stringify(settings))
}
