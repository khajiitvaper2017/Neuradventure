import type {
  ChatMessage,
  ChatMember,
  ChatDetail,
  ChatSummary,
  MainCharacterState,
  NPCState,
  StoryModules,
  TurnSummary,
  TurnVariantSummary,
  WorldState,
} from "../../../shared/types.js"

export interface ChatUpdateResult {
  ok: boolean
}

export interface ChatUpdateMessageResult {
  ok: boolean
  message: ChatMessage
}

export interface ChatRegenerateResult {
  ai_message: ChatMessage
  next_speaker_index: number
  replaced: boolean
}

export interface ChatCancelResult {
  removed_ids: number[]
  next_speaker_index: number
}

export interface ChatUndoCancelResult {
  messages: ChatMessage[]
  next_speaker_index: number
}

export interface ChatContinueResult {
  ai_message: ChatMessage
  next_speaker_index: number
}

export interface ChatSetNextSpeakerResult {
  next_speaker_index: number
}

export interface StoryDetail {
  id: number
  title: string
  opening_scenario: string
  author_note: string
  author_note_depth: number
  story_modules: StoryModules
  character: MainCharacterState
  world: WorldState
  initial_world: WorldState
  npcs: NPCState[]
  created_at: string
  updated_at: string
}

export interface UpdateStoryStateResult {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

export interface StoryCharacterGroup {
  id: number
  character: Omit<MainCharacterState, "inventory">
  card?: CharacterCardSummary | null
  stories: { id: number; title: string; updated_at: string }[]
}

export interface CharacterCardSummary {
  format: string
  avatar?: string
  tags: string[]
  creator?: string
  character_version?: string
  greeting_count: number
  has_character_book: boolean
}

export interface StoryNpcGroup {
  key: string
  npc: Omit<NPCState, "inventory">
  stories: { id: number; title: string; updated_at: string }[]
}

export type GenerateCharacterContext = Omit<MainCharacterState, "inventory">

export interface GenerateCharacterResponse {
  name: string
  race: string
  gender: string
  general_description?: string
  baseline_appearance?: string
  current_clothing?: string
  personality_traits?: string[]
  major_flaws?: string[]
  quirks?: string[]
  perks?: string[]
}

export interface GenerateCharacterAppearanceResponse {
  baseline_appearance: string
  current_appearance: string
}

export interface GenerateCharacterClothingResponse {
  current_clothing: string
}

export interface GenerateCharacterTraitsResponse {
  personality_traits: string[]
  major_flaws: string[]
  quirks: string[]
  perks: string[]
}

export interface GenerateStoryResponse {
  title: string
  opening_scenario: string
  starting_location: string
  starting_date: string
  starting_time: string
  current_appearance?: string
  character_general_description?: string
  pregen_npcs?: NPCState[]
}

export interface GenerateChatResponse {
  title: string
  greeting: string
}

export interface TurnResult {
  turn_id: number
  story_id: number
  turn_number: number
  narrative_text: string
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
  llm_warnings?: string[]
}

export interface CreateNpcResult {
  npc: NPCState
  npcs: NPCState[]
}

export interface ChatSendResult {
  player_message: ChatMessage
  ai_message: ChatMessage
  next_speaker_index: number
}

export interface ImpersonateResult {
  player_action: string
}

export interface CancelLastResult {
  removed_turn_id: number
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

export interface UndoCancelResult {
  turn_id: number
  story_id: number
  turn_number: number
  action_mode: "do" | "say" | "story"
  player_input: string
  narrative_text: string
  active_variant_id: number | null
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

export interface TurnVariantsResponse {
  active_variant_id: number | null
  variants: TurnVariantSummary[]
}

export interface SelectTurnVariantResult extends TurnResult {
  active_variant_id: number
}

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

export interface LLMConnector {
  type: "koboldcpp"
  url: string
  api_key: string
}

export interface AppSettings {
  theme: "default" | "amoled"
  design: "classic" | "roboto"
  textJustify: boolean
  colorScheme: "gold" | "emerald" | "sapphire" | "crimson"
  defaultAuthorNote: string
  defaultAuthorNoteDepth: number
  storyDefaults: StoryModules
  connector: LLMConnector
  generation: GenerationParams
  ctx_limit_detected?: number
}

export interface CharacterImportResult {
  id?: number
  character: Omit<MainCharacterState, "inventory">
  needs_review: boolean
  source?: "neuradventure" | "tavern"
  source_text?: string
  tavern_card?: object
  tavern_avatar_data_url?: string
}

export interface SamplerPreset {
  id?: number
  name: string
  description: string
  params: GenerationParams
}

export type { ChatMember, ChatDetail, ChatSummary, TurnSummary }
