// ─── Shared Types ──────────────────────────────────────────────────────────────

export interface InventoryItem {
  name: string
  description: string
}

export interface LocationItem {
  name: string
  description: string
}

export interface Location {
  name: string
  description: string
  characters: string[]
  available_items: LocationItem[]
}

export interface CharacterAppearance {
  baseline_appearance: string
  current_appearance: string
  current_clothing: string
}

export interface CharacterState {
  name: string
  race: string
  gender: string
  general_description?: string
  current_location: string
  appearance: CharacterAppearance
  personality_traits: string[]
  major_flaws: string[]
  quirks: string[]
  perks: string[]
  inventory: InventoryItem[]
}

export type MainCharacterState = CharacterState
export interface NPCState extends CharacterState {
  current_activity: string
}

export interface StoryModules {
  track_npcs: boolean
  track_locations: boolean
  character_detail_mode: "detailed" | "general"
}

export interface WorldState {
  current_scene: string
  current_date: string
  time_of_day: string
  memory: string
  locations: Location[]
}

export interface StoryMeta {
  id: number
  title: string
  turn_count: number
  character_name: string
  created_at: string
  updated_at: string
}

export interface ChatSummary {
  id: number
  title: string
  scenario: string
  message_count: number
  updated_at: string
  participants: string[]
  player_name: string
}

export interface ChatMember {
  id: number
  role: "player" | "ai"
  member_kind: "character" | "npc"
  character_id: number | null
  sort_order: number
  name: string
}

export interface ChatDetail {
  id: number
  title: string
  scenario: string
  speaker_strategy: string
  next_speaker_index: number
  can_undo_cancel: boolean
  created_at: string
  updated_at: string
  members: ChatMember[]
}

export interface ChatMessage {
  id: number
  message_index: number
  speaker_member_id: number
  speaker_name: string
  role: "user" | "assistant" | "system"
  content: string
  created_at: string
}

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
  stories: { id: number; title: string; updated_at: string }[]
}

export interface StoryNpcGroup {
  key: string
  npc: Omit<NPCState, "inventory">
  stories: { id: number; title: string; updated_at: string }[]
}

export interface TurnSummary {
  id: number
  turn_number: number
  action_mode?: "do" | "say" | "story"
  active_variant_id?: number | null
  player_input: string
  narrative_text: string
  world: WorldState
  created_at: string
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
  character_current_appearance?: string
  character_general_description?: string
  pregen_npcs?: NPCState[]
}

export interface GenerateChatResponse {
  title: string
  scenario: string
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

export interface TurnVariantSummary {
  id: number
  variant_index: number
  narrative_text: string
  created_at: string
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
}

export interface SamplerPreset {
  name: string
  description: string
  params: GenerationParams
}

// ─── HTTP Helper ───────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  let res: Response
  try {
    res = await fetch(path, {
      headers: { "Content-Type": "application/json" },
      ...options,
    })
  } catch (err) {
    console.error(`[api] Network error ${path}`, err)
    throw err
  }

  const text = await res.text()
  let body: unknown = null
  if (text) {
    try {
      body = JSON.parse(text)
    } catch {
      body = text
    }
  }

  if (!res.ok) {
    console.error(`[api] ${res.status} ${res.statusText} ${path}`, body)
    const message =
      body && typeof body === "object" && "error" in body && typeof (body as { error: unknown }).error === "string"
        ? (body as { error: string }).error
        : res.statusText
    throw new ApiError(res.status, message)
  }

  return body as T
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message)
    this.name = "ApiError"
  }
}

// ─── Stories ───────────────────────────────────────────────────────────────────

export const api = {
  stories: {
    list: () => request<StoryMeta[]>("/api/stories"),
    get: (id: number) => request<StoryDetail>(`/api/stories/${id}`),
    create: (data: {
      title: string
      opening_scenario: string
      starting_scene?: string
      starting_date?: string
      starting_time?: string
      character_id?: number
      character_data?: Omit<MainCharacterState, "inventory">
      npcs?: NPCState[]
      story_modules?: StoryModules
    }) => request<{ id: number }>("/api/stories", { method: "POST", body: JSON.stringify(data) }),
    update: (
      id: number,
      data: {
        title?: string
        opening_scenario?: string
        author_note?: string
        author_note_depth?: number
        story_modules?: StoryModules
      },
    ) => request<{ ok: boolean }>(`/api/stories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    updateState: (
      id: number,
      data: { character?: MainCharacterState; npcs?: NPCState[]; world?: { memory?: string } },
    ) => request<UpdateStoryStateResult>(`/api/stories/${id}/state`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request<{ ok: boolean }>(`/api/stories/${id}`, { method: "DELETE" }),
    exportUrl: (id: number, format?: "neuradventure" | "tavern" | "plaintext") =>
      `/api/stories/${id}/export${format ? `?format=${format}` : ""}`,
    import: (data: object | string) => {
      const options: RequestInit = {
        method: "POST",
        body: typeof data === "string" ? data : JSON.stringify(data),
      }
      if (typeof data === "string") {
        options.headers = { "Content-Type": "text/plain" }
      }
      return request<{ id: number }>("/api/stories/import", options)
    },
    characters: () => request<StoryCharacterGroup[]>("/api/stories/characters"),
    npcs: () => request<StoryNpcGroup[]>("/api/stories/npcs"),
    exportCharacter: (charId: number, format?: "neuradventure" | "tavern-card") =>
      `/api/stories/characters/${charId}/export${format ? `?format=${format}` : ""}`,
    importCharacter: (data: object) =>
      request<CharacterImportResult>("/api/stories/characters/import", {
        method: "POST",
        body: JSON.stringify(data),
      }),
  },

  chats: {
    list: () => request<ChatSummary[]>("/api/chats"),
    get: (id: number) => request<ChatDetail>(`/api/chats/${id}`),
    messages: (id: number) => request<ChatMessage[]>(`/api/chats/${id}/messages`),
    update: (id: number, data: { title?: string; scenario?: string }) =>
      request<ChatUpdateResult>(`/api/chats/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    updateMessage: (chatId: number, messageId: number, content: string) =>
      request<ChatUpdateMessageResult>(`/api/chats/${chatId}/messages/${messageId}`, {
        method: "PUT",
        body: JSON.stringify({ content }),
      }),
    deleteMessage: (chatId: number, messageId: number) =>
      request<{ ok: boolean }>(`/api/chats/${chatId}/messages/${messageId}`, { method: "DELETE" }),
    create: (data: {
      title?: string
      scenario?: string
      members: Array<{
        role: "player" | "ai"
        member_kind: "character" | "npc"
        character_id?: number | null
        state: Omit<MainCharacterState, "inventory"> | Omit<NPCState, "inventory">
      }>
    }) => request<{ id: number }>("/api/chats", { method: "POST", body: JSON.stringify(data) }),
    send: (id: number, content: string) =>
      request<ChatSendResult>(`/api/chats/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ chat_id: id, content }),
      }),
    continue: (id: number) =>
      request<ChatContinueResult>(`/api/chats/${id}/continue`, {
        method: "POST",
        body: JSON.stringify({ chat_id: id }),
      }),
    regenerateLast: (id: number) =>
      request<ChatRegenerateResult>(`/api/chats/${id}/regenerate`, {
        method: "POST",
        body: JSON.stringify({ chat_id: id }),
      }),
    cancelLast: (id: number) =>
      request<ChatCancelResult>(`/api/chats/${id}/cancel-last`, {
        method: "POST",
        body: JSON.stringify({ chat_id: id }),
      }),
    undoCancel: (id: number) =>
      request<ChatUndoCancelResult>(`/api/chats/${id}/undo-cancel`, {
        method: "POST",
        body: JSON.stringify({ chat_id: id }),
      }),
    setNextSpeaker: (id: number, speakerMemberId: number) =>
      request<ChatSetNextSpeakerResult>(`/api/chats/${id}/next-speaker`, {
        method: "POST",
        body: JSON.stringify({ chat_id: id, speaker_member_id: speakerMemberId }),
      }),
  },

  turns: {
    list: (storyId: number) => request<TurnSummary[]>(`/api/turns/${storyId}`),
    take: (storyId: number, playerInput: string, actionMode: "do" | "say" | "story", requestId?: string) =>
      request<TurnResult>("/api/turns", {
        method: "POST",
        body: JSON.stringify({
          story_id: storyId,
          player_input: playerInput,
          action_mode: actionMode,
          request_id: requestId,
        }),
      }),
    createNpc: (storyId: number, npcName: string, requestId?: string) =>
      request<CreateNpcResult>("/api/turns/create-npc", {
        method: "POST",
        body: JSON.stringify({
          story_id: storyId,
          player_input: npcName,
          action_mode: "do",
          request_id: requestId,
        }),
      }),
    regenerateLast: (storyId: number, actionMode: "do" | "say" | "story") =>
      request<TurnResult>("/api/turns/regenerate-last", {
        method: "POST",
        body: JSON.stringify({ story_id: storyId, action_mode: actionMode }),
      }),
    impersonate: (storyId: number, actionMode: "do" | "say" | "story") =>
      request<ImpersonateResult>("/api/turns/impersonate", {
        method: "POST",
        body: JSON.stringify({ story_id: storyId, action_mode: actionMode }),
      }),
    cancelLast: (storyId: number) =>
      request<CancelLastResult>("/api/turns/cancel-last", {
        method: "POST",
        body: JSON.stringify({ story_id: storyId }),
      }),
    undoCancel: (storyId: number) =>
      request<UndoCancelResult>("/api/turns/undo-cancel", {
        method: "POST",
        body: JSON.stringify({ story_id: storyId }),
      }),
    variants: (turnId: number) => request<TurnVariantsResponse>(`/api/turns/${turnId}/variants`),
    selectVariant: (turnId: number, variantId: number) =>
      request<SelectTurnVariantResult>(`/api/turns/${turnId}/variants/select`, {
        method: "POST",
        body: JSON.stringify({ variant_id: variantId }),
      }),
    update: (turnId: number, data: { player_input?: string; narrative_text?: string }) =>
      request<{ ok: boolean }>(`/api/turns/${turnId}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (turnId: number) => request<{ ok: boolean }>(`/api/turns/${turnId}`, { method: "DELETE" }),
  },

  generate: {
    character: (description: string, storyModules?: StoryModules) =>
      request<GenerateCharacterResponse>("/api/generate/character", {
        method: "POST",
        body: JSON.stringify({ description, story_modules: storyModules }),
      }),
    characterAppearance: (context: GenerateCharacterContext, storyModules?: StoryModules) =>
      request<GenerateCharacterAppearanceResponse>("/api/generate/character/part", {
        method: "POST",
        body: JSON.stringify({ part: "appearance", context, story_modules: storyModules }),
      }),
    characterClothing: (context: GenerateCharacterContext, storyModules?: StoryModules) =>
      request<GenerateCharacterClothingResponse>("/api/generate/character/part", {
        method: "POST",
        body: JSON.stringify({ part: "clothing", context, story_modules: storyModules }),
      }),
    characterTraits: (context: GenerateCharacterContext, storyModules?: StoryModules) =>
      request<GenerateCharacterTraitsResponse>("/api/generate/character/part", {
        method: "POST",
        body: JSON.stringify({ part: "traits", context, story_modules: storyModules }),
      }),
    story: (description: string, character: Omit<MainCharacterState, "inventory">, storyModules?: StoryModules) =>
      request<GenerateStoryResponse>("/api/generate/story", {
        method: "POST",
        body: JSON.stringify({ description, character, story_modules: storyModules }),
      }),
    chat: (description: string) =>
      request<GenerateChatResponse>("/api/generate/chat", {
        method: "POST",
        body: JSON.stringify({ description }),
      }),
  },

  settings: {
    get: () => request<AppSettings>("/api/settings"),
    update: (data: Partial<AppSettings>) =>
      request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
    presets: () => request<SamplerPreset[]>("/api/settings/presets"),
  },
}
