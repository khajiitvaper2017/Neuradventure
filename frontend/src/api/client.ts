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
  gender: "male" | "female" | "other"
  appearance: CharacterAppearance
  personality_traits: string[]
  custom_traits: string[]
  inventory: InventoryItem[]
}

export interface NPCState {
  name: string
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

export interface CharacterMeta {
  id: number
  name: string
  gender: string
  created_at: string
  updated_at: string
}

export interface CharacterDetail extends CharacterMeta {
  state: MainCharacterState
}

export interface TurnSummary {
  id: number
  turn_number: number
  player_input: string
  narrative_text: string
  created_at: string
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

// ─── HTTP Helper ───────────────────────────────────────────────────────────────

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }))
    throw new ApiError(res.status, body.error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
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
      character_id?: number
      character_data?: Omit<MainCharacterState, "inventory">
    }) => request<{ id: number }>("/api/stories", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: { title?: string; opening_scenario?: string }) =>
      request<{ ok: boolean }>(`/api/stories/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request<{ ok: boolean }>(`/api/stories/${id}`, { method: "DELETE" }),
    exportUrl: (id: number) => `/api/stories/${id}/export`,
    import: (data: object) =>
      request<{ id: number }>("/api/stories/import", { method: "POST", body: JSON.stringify(data) }),
  },

  characters: {
    list: () => request<CharacterMeta[]>("/api/characters"),
    get: (id: number) => request<CharacterDetail>(`/api/characters/${id}`),
    create: (data: Omit<MainCharacterState, "inventory">) =>
      request<{ id: number }>("/api/characters", { method: "POST", body: JSON.stringify(data) }),
    update: (id: number, data: Partial<Omit<MainCharacterState, "inventory">>) =>
      request<{ ok: boolean }>(`/api/characters/${id}`, { method: "PUT", body: JSON.stringify(data) }),
    delete: (id: number) => request<{ ok: boolean }>(`/api/characters/${id}`, { method: "DELETE" }),
    exportUrl: (id: number) => `/api/characters/${id}/export`,
    import: (data: object) =>
      request<{ id: number }>("/api/characters/import", { method: "POST", body: JSON.stringify(data) }),
  },

  turns: {
    list: (storyId: number) => request<TurnSummary[]>(`/api/turns/${storyId}`),
    take: (storyId: number, playerInput: string, actionMode: "do" | "say" | "story") =>
      request<TurnResult>("/api/turns", {
        method: "POST",
        body: JSON.stringify({ story_id: storyId, player_input: playerInput, action_mode: actionMode }),
      }),
  },
}
