import { request } from "./http.js"
import type { MainCharacterState, NPCState, StoryModules, StoryMeta } from "../../../shared/types.js"
import type {
  StoryDetail,
  StoryCharacterGroup,
  StoryNpcGroup,
  UpdateStoryStateResult,
  CharacterImportResult,
} from "./types.js"

export const stories = {
  list: () => request<StoryMeta[]>("/api/stories"),
  get: (id: number) => request<StoryDetail>(`/api/stories/${id}`),
  create: (data: {
    title: string
    opening_scenario: string
    starting_scene?: string
    starting_date?: string
    starting_time?: string
    character_id?: number
    tavern_card?: object
    tavern_avatar_data_url?: string
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
  updateState: (id: number, data: { character?: MainCharacterState; npcs?: NPCState[]; world?: { memory?: string } }) =>
    request<UpdateStoryStateResult>(`/api/stories/${id}/state`, { method: "PUT", body: JSON.stringify(data) }),
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
  getCharacterCard: (charId: number) => request<object>(`/api/stories/characters/${charId}/card`),
  importCharacter: (data: object) =>
    request<CharacterImportResult>("/api/stories/characters/import", {
      method: "POST",
      body: JSON.stringify(data),
    }),
}
