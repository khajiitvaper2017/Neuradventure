import { getDb } from "./connection.js"
import type { SettingsState, GenerationParams, LLMConnector, OpenRouterConnector, KoboldCppConnector } from "./types.js"
import { DEFAULT_STORY_MODULES, normalizeStoryModules } from "../../schemas/story-modules.js"

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
  authorNoteEnabled: true,
  defaultAuthorNote: "Remember the instructions you were given at the beginning of this chat.",
  defaultAuthorNoteDepth: 4,
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
