import { AppError } from "@/errors"
import type { MainCharacterState, NPCState, StoryMeta, StoryModules } from "@/shared/types"
import type { StoryDetail, UpdateStoryStateResult } from "@/shared/api-types"
import * as db from "@/engine/core/db"
import { MainCharacterStateStoredSchema, NPCStateStoredSchema } from "@/engine/core/models"
import { TavernCardV2Schema } from "@/engine/utils/converters/tavern"
import { createNewStory } from "@/engine/game"
import { parseStoryModules, parseStoryState } from "@/services/stories/state"

export async function list(): Promise<StoryMeta[]> {
  const rows = db.listStories()
  return rows.map((r) => ({
    id: r.id,
    title: r.title,
    turn_count: r.turn_count,
    character_name: MainCharacterStateStoredSchema.parse(JSON.parse(r.character_state_json)).name,
    created_at: r.created_at,
    updated_at: r.updated_at,
  }))
}

export async function get(id: number): Promise<StoryDetail> {
  const row = db.getStory(id)
  if (!row) throw new AppError(404, "Story not found")
  const { character, world, initialWorld, npcs } = parseStoryState(row)
  const storyModules = parseStoryModules(row)
  return {
    id: row.id,
    title: row.title,
    opening_scenario: row.opening_scenario,
    author_note: row.author_note ?? "",
    author_note_depth: row.author_note_depth ?? 4,
    author_note_position: row.author_note_position ?? 1,
    author_note_interval: row.author_note_interval ?? 1,
    author_note_role: row.author_note_role ?? 0,
    author_note_embed_state: (row.author_note_embed_state ?? 0) === 1,
    story_modules: storyModules,
    character,
    world,
    initial_world: initialWorld,
    npcs,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export async function create(data: {
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
}): Promise<{ id: number }> {
  let character: MainCharacterState
  let characterId: number | null = null

  if (data.character_id) {
    const charRow = db.getCharacter(data.character_id)
    if (!charRow) throw new AppError(404, "Character not found")
    const base = MainCharacterStateStoredSchema.parse(JSON.parse(charRow.state_json))
    const merged = data.character_data
      ? MainCharacterStateStoredSchema.parse({ ...base, ...data.character_data })
      : base
    character = { ...merged, inventory: [] }
    characterId = charRow.id
  } else if (data.character_data) {
    const parsed = MainCharacterStateStoredSchema.parse(data.character_data)
    const { inventory: _inventory, ...base } = parsed
    void _inventory
    characterId = db.createCharacter(base)
    if (data.tavern_card !== undefined && data.tavern_card !== null) {
      const parsedCard = TavernCardV2Schema.safeParse(data.tavern_card)
      if (!parsedCard.success) throw new AppError(400, "Invalid tavern_card payload")
      db.upsertCharacterCard(
        characterId,
        "tavern-card-v2",
        JSON.stringify(data.tavern_card),
        data.tavern_avatar_data_url ?? undefined,
      )
    }
    character = parsed
  } else {
    throw new AppError(400, "Provide character_id or character_data")
  }

  const id = createNewStory(
    data.title,
    data.opening_scenario,
    character,
    data.npcs ?? [],
    data.starting_scene,
    data.starting_date,
    data.starting_time,
    data.story_modules ?? db.getSettings().storyDefaults,
    characterId,
  )
  return { id }
}

export async function update(
  id: number,
  data: {
    title?: string
    opening_scenario?: string
    author_note?: string
    author_note_depth?: number
    author_note_position?: number
    author_note_interval?: number
    author_note_role?: number
    author_note_embed_state?: boolean
    story_modules?: StoryModules
  },
): Promise<{ ok: boolean }> {
  const row = db.getStory(id)
  if (!row) throw new AppError(404, "Story not found")
  db.updateStoryMeta(id, {
    title: data.title,
    opening_scenario: data.opening_scenario,
    author_note: data.author_note,
    author_note_depth: data.author_note_depth,
    author_note_position: data.author_note_position,
    author_note_interval: data.author_note_interval,
    author_note_role: data.author_note_role,
    author_note_embed_state: data.author_note_embed_state,
    story_modules: data.story_modules,
  })
  return { ok: true }
}

export async function updateState(
  id: number,
  data: {
    character?: MainCharacterState
    npcs?: NPCState[]
    world?: { memory?: string; custom_fields?: Record<string, string | string[]> }
  },
): Promise<UpdateStoryStateResult> {
  const row = db.getStory(id)
  if (!row) throw new AppError(404, "Story not found")
  const currentCharacter = MainCharacterStateStoredSchema.parse(JSON.parse(row.character_state_json))
  const { world: currentWorld, npcs: currentNpcs } = parseStoryState(row)
  const nextCharacter = data.character ? MainCharacterStateStoredSchema.parse(data.character) : currentCharacter
  const nextNpcs = data.npcs ? data.npcs.map((n) => NPCStateStoredSchema.parse(n)) : currentNpcs
  const nextWorld = data.world
    ? {
        ...currentWorld,
        memory: data.world.memory ?? currentWorld.memory,
        custom_fields:
          data.world.custom_fields &&
          typeof data.world.custom_fields === "object" &&
          !Array.isArray(data.world.custom_fields)
            ? (data.world.custom_fields as Record<string, string | string[]>)
            : currentWorld.custom_fields,
      }
    : currentWorld
  db.updateStory(id, nextCharacter, nextWorld, nextNpcs)
  return { character: nextCharacter, world: nextWorld, npcs: nextNpcs }
}

export async function deleteStory(id: number): Promise<{ ok: boolean }> {
  db.deleteStory(id)
  return { ok: true }
}
