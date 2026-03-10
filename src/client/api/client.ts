// ─── Shared Types ──────────────────────────────────────────────────────────────

export interface InventoryItem {
  name: string
  description: string
}

export interface CharacterAppearance {
  physical_description: string
  current_clothing: string
}

export interface MainCharacterState {
  name: string
  race: string
  gender: string
  appearance: CharacterAppearance
  personality_traits: string[]
  custom_traits: string[]
  inventory: InventoryItem[]
}

export interface NPCState {
  name: string
  race: string
  last_known_location: string
  appearance: CharacterAppearance
  personality_traits: string[]
  relationship_to_player: string
  notes: string
}

export interface WorldState {
  current_scene: string
  time_of_day: string
  recent_events_summary: string
}

export interface StoryMeta {
  id: number
  title: string
  turn_count: number
  character_name: string
  created_at: string
  updated_at: string
}

export interface StoryDetail {
  id: number
  title: string
  opening_scenario: string
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
  created_at: string
  updated_at: string
}

export interface StoryCharacterGroup {
  id: number
  character: Omit<MainCharacterState, "inventory">
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

export interface GenerateCharacterResponse {
  name: string
  race: string
  gender: string
  physical_description: string
  current_clothing: string
  personality_traits: string[]
  custom_traits: string[]
}

export interface GenerateCharacterAppearanceResponse {
  physical_description: string
}

export interface GenerateCharacterClothingResponse {
  current_clothing: string
}

export interface GenerateCharacterTraitsResponse {
  personality_traits: string[]
  custom_traits: string[]
}

export interface GenerateCharacterContext {
  name: string
  race: string
  gender: string
  appearance: CharacterAppearance
  personality_traits: string[]
  custom_traits: string[]
}

export interface GenerateStoryResponse {
  title: string
  opening_scenario: string
  starting_location: string
  pregen_npcs: NPCState[]
}

export interface TurnResult {
  turn_id: number
  story_id: number
  turn_number: number
  narrative_text: string
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

export interface CancelLastResult {
  removed_turn_id: number
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
  connector: LLMConnector
  generation: GenerationParams
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
      character_id?: number
      character_data?: Omit<MainCharacterState, "inventory">
      npcs?: NPCState[]
    }) => request<{ id: number }>("/api/stories", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { title?: string; opening_scenario?: string }) =>
      request<{ ok: boolean }>(`/api/stories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request<{ ok: boolean }>(`/api/stories/${id}`, { method: "DELETE" }),
    exportUrl: (id: number) => `/api/stories/${id}/export`,
    import: (data: object) =>
      request<{ id: number }>("/api/stories/import", { method: "POST", body: JSON.stringify(data) }),
    characters: () => request<StoryCharacterGroup[]>("/api/stories/characters"),
  },

  turns: {
    list: (storyId: number) => request<TurnSummary[]>(`/api/turns/${storyId}`),
    take: (storyId: number, playerInput: string, actionMode: "do" | "say" | "story") =>
      request<TurnResult>("/api/turns", {
        method: "POST",
        body: JSON.stringify({ story_id: storyId, player_input: playerInput, action_mode: actionMode }),
      }),
    regenerateLast: (storyId: number, actionMode: "do" | "say" | "story") =>
      request<TurnResult>("/api/turns/regenerate-last", {
        method: "POST",
        body: JSON.stringify({ story_id: storyId, action_mode: actionMode }),
      }),
    cancelLast: (storyId: number) =>
      request<CancelLastResult>("/api/turns/cancel-last", {
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
  },

  generate: {
    character: (description: string) =>
      request<GenerateCharacterResponse>("/api/generate/character", {
        method: "POST",
        body: JSON.stringify({ description }),
      }),
    characterAppearance: (context: GenerateCharacterContext) =>
      request<GenerateCharacterAppearanceResponse>("/api/generate/character/part", {
        method: "POST",
        body: JSON.stringify({ part: "appearance", context }),
      }),
    characterClothing: (context: GenerateCharacterContext) =>
      request<GenerateCharacterClothingResponse>("/api/generate/character/part", {
        method: "POST",
        body: JSON.stringify({ part: "clothing", context }),
      }),
    characterTraits: (context: GenerateCharacterContext) =>
      request<GenerateCharacterTraitsResponse>("/api/generate/character/part", {
        method: "POST",
        body: JSON.stringify({ part: "traits", context }),
      }),
    story: (description: string, character: Omit<MainCharacterState, "inventory">) =>
      request<GenerateStoryResponse>("/api/generate/story", {
        method: "POST",
        body: JSON.stringify({ description, character }),
      }),
  },

  settings: {
    get: () => request<AppSettings>("/api/settings"),
    update: (data: Partial<AppSettings>) =>
      request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
    presets: () => request<SamplerPreset[]>("/api/settings/presets"),
  },
}
