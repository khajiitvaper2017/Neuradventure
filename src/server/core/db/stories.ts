import type { MainCharacterState, NPCState, StoryModules, WorldState } from "../models.js"
import { getDb } from "./connection.js"

export interface StoryRow {
  id: number
  character_id: number | null
  title: string
  opening_scenario: string
  character_state_json: string
  world_state_json: string
  npc_states_json: string
  story_modules_json: string
  initial_character_state_json: string | null
  initial_world_state_json: string | null
  initial_npc_states_json: string | null
  author_note: string
  author_note_depth: number
  author_note_position: number
  author_note_interval: number
  author_note_role: number
  author_note_embed_state: number
  created_at: string
  updated_at: string
}

export interface StoryCharacterRow {
  id: number
  title: string
  character_state_json: string
  updated_at: string
}

export interface StoryNpcRow {
  id: number
  title: string
  npc_states_json: string
  updated_at: string
}

export function listStories(): (StoryRow & { turn_count: number })[] {
  return getDb()
    .prepare(
      `SELECT s.*, COUNT(t.id) as turn_count
       FROM stories s
       LEFT JOIN turns t ON t.story_id = s.id
       GROUP BY s.id
       ORDER BY s.updated_at DESC`,
    )
    .all() as (StoryRow & { turn_count: number })[]
}

export function listStoriesWithCharacters(): StoryCharacterRow[] {
  return getDb()
    .prepare("SELECT id, title, character_state_json, updated_at FROM stories ORDER BY updated_at DESC")
    .all() as StoryCharacterRow[]
}

export function listStoriesWithNpcs(): StoryNpcRow[] {
  return getDb()
    .prepare("SELECT id, title, npc_states_json, updated_at FROM stories ORDER BY updated_at DESC")
    .all() as StoryNpcRow[]
}

export function getStory(id: number): StoryRow | undefined {
  return getDb().prepare("SELECT * FROM stories WHERE id = ?").get(id) as StoryRow | undefined
}

export function createStory(
  title: string,
  opening_scenario: string,
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  storyModules: StoryModules,
  characterId: number | null,
  authorNote: string,
  authorNoteDepth: number,
  authorNotePosition: number,
  authorNoteInterval: number,
  authorNoteRole: number,
  authorNoteEmbedState: boolean,
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO stories (
        character_id,
        title,
        opening_scenario,
        character_state_json,
        world_state_json,
        npc_states_json,
        story_modules_json,
        initial_character_state_json,
        initial_world_state_json,
        initial_npc_states_json,
        author_note,
        author_note_depth,
        author_note_position,
        author_note_interval,
        author_note_role,
        author_note_embed_state
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      characterId,
      title,
      opening_scenario,
      JSON.stringify(character),
      JSON.stringify(world),
      JSON.stringify(npcs),
      JSON.stringify(storyModules),
      JSON.stringify(character),
      JSON.stringify(world),
      JSON.stringify(npcs),
      authorNote,
      authorNoteDepth,
      authorNotePosition,
      authorNoteInterval,
      authorNoteRole,
      authorNoteEmbedState ? 1 : 0,
    )
  return result.lastInsertRowid as number
}

export function updateStory(id: number, character: MainCharacterState, world: WorldState, npcs: NPCState[]): void {
  getDb()
    .prepare(
      `UPDATE stories SET character_state_json = ?, world_state_json = ?, npc_states_json = ?,
       updated_at = datetime('now') WHERE id = ?`,
    )
    .run(JSON.stringify(character), JSON.stringify(world), JSON.stringify(npcs), id)
}

export function updateStoryMeta(
  id: number,
  fields: {
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
): void {
  const updates: string[] = ["updated_at = datetime('now')"]
  const values: unknown[] = []
  if (fields.title !== undefined) {
    updates.push("title = ?")
    values.push(fields.title)
  }
  if (fields.opening_scenario !== undefined) {
    updates.push("opening_scenario = ?")
    values.push(fields.opening_scenario)
  }
  if (fields.author_note !== undefined) {
    updates.push("author_note = ?")
    values.push(fields.author_note)
  }
  if (fields.author_note_depth !== undefined) {
    updates.push("author_note_depth = ?")
    values.push(fields.author_note_depth)
  }
  if (fields.author_note_position !== undefined) {
    updates.push("author_note_position = ?")
    values.push(fields.author_note_position)
  }
  if (fields.author_note_interval !== undefined) {
    updates.push("author_note_interval = ?")
    values.push(fields.author_note_interval)
  }
  if (fields.author_note_role !== undefined) {
    updates.push("author_note_role = ?")
    values.push(fields.author_note_role)
  }
  if (fields.author_note_embed_state !== undefined) {
    updates.push("author_note_embed_state = ?")
    values.push(fields.author_note_embed_state ? 1 : 0)
  }
  if (fields.story_modules !== undefined) {
    updates.push("story_modules_json = ?")
    values.push(JSON.stringify(fields.story_modules))
  }
  values.push(id)
  getDb()
    .prepare(`UPDATE stories SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values)
}

export function deleteStory(id: number): void {
  getDb().prepare("DELETE FROM stories WHERE id = ?").run(id)
}
