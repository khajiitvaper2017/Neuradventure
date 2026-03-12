import { getDb } from "./connection.js"
import type { SettingsState, GenerationParams } from "./types.js"
import { DEFAULT_STORY_MODULES, normalizeStoryModules } from "../../schemas/story-modules.js"

export const DEFAULT_GENERATION: GenerationParams = {
  max_tokens: 1500,
  ctx_limit: 0,
  temperature: 0.85,
  top_k: 40,
  top_p: 0.95,
  min_p: 0.05,
  typical_p: 1.0,
  top_n_sigma: -1.0,
  repeat_penalty: 1.0,
  repeat_last_n: 64,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
  mirostat: 0,
  mirostat_tau: 5.0,
  mirostat_eta: 0.1,
  dynatemp_range: 0.0,
  dynatemp_exponent: 1.0,
  dry_multiplier: 0.0,
  dry_base: 1.75,
  dry_allowed_length: 2,
  dry_penalty_last_n: -1,
  xtc_probability: 0.0,
  xtc_threshold: 0.1,
  seed: -1,
}

export const DEFAULT_SETTINGS: SettingsState = {
  theme: "default",
  design: "classic",
  textJustify: true,
  colorScheme: "gold",
  defaultAuthorNote: "Remember the instructions you were given at the beginning of this chat.",
  defaultAuthorNoteDepth: 4,
  storyDefaults: { ...DEFAULT_STORY_MODULES },
  connector: {
    type: "koboldcpp",
    url: "http://localhost:5001/v1",
    api_key: "kobold",
  },
  generation: { ...DEFAULT_GENERATION },
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
      connector: { ...DEFAULT_SETTINGS.connector, ...(stored.connector ?? {}) },
      generation: { ...DEFAULT_SETTINGS.generation, ...(stored.generation ?? {}) },
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
