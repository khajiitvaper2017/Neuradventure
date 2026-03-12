import type { MainCharacterState, StoryModules } from "../models.js"

export type CharacterBase = Omit<MainCharacterState, "inventory">

export interface GenerationParams {
  max_tokens: number
  ctx_limit: number
  temperature: number
  top_k: number
  top_p: number
  min_p: number
  typical_p: number
  top_n_sigma: number
  repeat_penalty: number
  repeat_last_n: number
  presence_penalty: number
  frequency_penalty: number
  mirostat: number
  mirostat_tau: number
  mirostat_eta: number
  dynatemp_range: number
  dynatemp_exponent: number
  dry_multiplier: number
  dry_base: number
  dry_allowed_length: number
  dry_penalty_last_n: number
  xtc_probability: number
  xtc_threshold: number
  seed: number
}

export interface LLMConnector {
  type: "koboldcpp"
  url: string
  api_key: string
}

export interface SettingsState {
  theme: "default" | "amoled"
  design: "classic" | "roboto"
  textJustify: boolean
  colorScheme: "gold" | "emerald" | "sapphire" | "crimson"
  defaultAuthorNote: string
  defaultAuthorNoteDepth: number
  storyDefaults: StoryModules
  connector: LLMConnector
  generation: GenerationParams
}
