import type { MainCharacterState, NPCState, StoryMeta, StoryModules } from "@/shared/types"
import type {
  CharacterImportResult,
  StoryCharacterGroup,
  StoryDetail,
  StoryNpcGroup,
  UpdateStoryStateResult,
} from "@/shared/api-types"
import {
  characters,
  deleteCharacter,
  exportCharacterAndDownload,
  getCharacter,
  getCharacterCard,
  importCharacter,
} from "@/services/stories/characters"
import { create, deleteStory, get, list, update, updateState } from "@/services/stories/crud"
import { exportAndDownload } from "@/services/stories/export"
import { importStory } from "@/services/stories/import"
import { npcs } from "@/services/stories/npcs"

export const stories = {
  list,
  get,
  create: create as unknown as (data: {
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
  }) => Promise<{ id: number }>,
  update,
  updateState: updateState as unknown as (
    id: number,
    data: { character?: MainCharacterState; npcs?: NPCState[]; world?: { memory?: string } },
  ) => Promise<UpdateStoryStateResult>,
  delete: deleteStory,
  exportAndDownload,
  import: importStory,
  characters: characters as unknown as () => Promise<StoryCharacterGroup[]>,
  getCharacter: getCharacter as unknown as (id: number) => Promise<MainCharacterState>,
  deleteCharacter,
  npcs: npcs as unknown as () => Promise<StoryNpcGroup[]>,
  exportCharacterAndDownload: exportCharacterAndDownload as unknown as (
    charId: number,
    format?: "neuradventure" | "tavern-card",
  ) => Promise<void>,
  getCharacterCard,
  importCharacter: importCharacter as unknown as (body: object) => Promise<CharacterImportResult>,
} satisfies {
  list: () => Promise<StoryMeta[]>
  get: (id: number) => Promise<StoryDetail>
  create: (data: unknown) => Promise<{ id: number }>
  update: (id: number, data: unknown) => Promise<{ ok: boolean }>
  updateState: (id: number, data: unknown) => Promise<UpdateStoryStateResult>
  delete: (id: number) => Promise<{ ok: boolean }>
  exportAndDownload: (id: number, format?: "neuradventure" | "tavern" | "plaintext") => Promise<void>
  import: (data: object | string) => Promise<{ id: number }>
  characters: () => Promise<StoryCharacterGroup[]>
  getCharacter: (id: number) => Promise<MainCharacterState>
  deleteCharacter: (id: number) => Promise<{ ok: boolean }>
  npcs: () => Promise<StoryNpcGroup[]>
  exportCharacterAndDownload: (charId: number, format?: "neuradventure" | "tavern-card") => Promise<void>
  getCharacterCard: (charId: number) => Promise<object>
  importCharacter: (body: object) => Promise<CharacterImportResult>
}
