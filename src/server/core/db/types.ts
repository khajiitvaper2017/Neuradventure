import type { MainCharacterState, StoryModules } from "../models.js"

export type CharacterBase = Omit<MainCharacterState, "inventory">

export interface GenerationParams {
  max_tokens: number
  ctx_limit: number
  temperature: number
  top_k: number
  top_a: number
  top_p: number
  min_p: number
  typical_p: number
  tfs: number
  top_n_sigma: number
  repeat_penalty: number
  repeat_last_n: number
  rep_pen_slope: number
  presence_penalty: number
  frequency_penalty: number
  mirostat: number
  mirostat_tau: number
  mirostat_eta: number
  dynatemp_range: number
  dynatemp_exponent: number
  smoothing_factor: number
  smoothing_curve: number
  adaptive_target: number
  adaptive_decay: number
  dry_multiplier: number
  dry_base: number
  dry_allowed_length: number
  dry_penalty_last_n: number
  dry_sequence_breakers: string[]
  xtc_probability: number
  xtc_threshold: number
  ban_eos_token: boolean
  sampler_order: number[]
  banned_tokens: string[]
  logit_bias: Record<string, number>
  render_special: boolean
  seed: number
}

export type KoboldCppConnector = {
  type: "koboldcpp"
  url: string
  api_keys: {
    koboldcpp: string
    openrouter: string
  }
}

export type OpenRouterConnector = {
  type: "openrouter"
  url: string
  api_keys: {
    koboldcpp: string
    openrouter: string
  }
  model: string
}

export type LLMConnector = KoboldCppConnector | OpenRouterConnector

export interface TimeoutSettings {
  llmRequestMs: number
  upstreamFetchMs: number
  streamSessionTtlMs: number
  modelsCacheTtlMs: number
  supportedParamsCacheTtlMs: number
  ctxLimitCacheTtlMs: number
  pendingRequestTtlMs: number
  uiErrorToastMs: number
  uiQuietNoticeMs: number
  uiFlashMs: number
  uiKeyboardScrollDelayMs: number
  uiResumePendingTurnDelayMs: number
  fieldWatchDebounceMs: number
}

export interface SettingsState {
  theme: "default" | "amoled"
  design: "classic" | "roboto"
  textJustify: boolean
  colorScheme: "gold" | "emerald" | "sapphire" | "crimson"
  streamingEnabled: boolean
  sectionFormat: "xml" | "markdown" | "equals" | "bbcode" | "colon" | "none"
  timeouts: TimeoutSettings
  authorNoteEnabled: boolean
  defaultAuthorNote: string
  defaultAuthorNoteDepth: number
  defaultAuthorNotePosition: number
  defaultAuthorNoteInterval: number
  defaultAuthorNoteRole: number
  defaultAuthorNoteEmbedState: boolean
  storyDefaults: StoryModules
  connector: LLMConnector
  generation: GenerationParams
}
