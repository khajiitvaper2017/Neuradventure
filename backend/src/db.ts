import Database from "better-sqlite3"
import path from "path"
import { fileURLToPath } from "url"
import type { MainCharacterState, NPCState, WorldState } from "./models.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const DB_PATH = path.resolve(__dirname, "../../data/neuradventure.db")

let db: Database.Database

export interface SettingsState {
  theme: "default" | "amoled"
  design: "classic" | "roboto"
}

const DEFAULT_SETTINGS: SettingsState = {
  theme: "default",
  design: "classic",
}

export function getDb(): Database.Database {
  if (!db) {
    db = new Database(DB_PATH)
    db.pragma("journal_mode = WAL")
    db.pragma("foreign_keys = ON")
  }
  return db
}

export function initDb() {
  const database = getDb()
  database.exec(`
    CREATE TABLE IF NOT EXISTS characters (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL,
      gender      TEXT NOT NULL,
      state_json  TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stories (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      title                 TEXT NOT NULL,
      opening_scenario      TEXT NOT NULL,
      character_state_json  TEXT NOT NULL,
      world_state_json      TEXT NOT NULL,
      npc_states_json       TEXT NOT NULL,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS turns (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id                  INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      turn_number               INTEGER NOT NULL,
      player_input              TEXT NOT NULL,
      narrative_text            TEXT NOT NULL,
      character_snapshot_json   TEXT NOT NULL,
      world_snapshot_json       TEXT NOT NULL,
      npc_snapshot_json         TEXT NOT NULL,
      created_at                TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_turns_story ON turns(story_id, turn_number);

    CREATE TABLE IF NOT EXISTS settings (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json TEXT NOT NULL,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `)

  const settingsRow = database
    .prepare("SELECT settings_json FROM settings WHERE id = 1")
    .get() as { settings_json: string } | undefined
  if (!settingsRow) {
    database
      .prepare("INSERT INTO settings (id, settings_json) VALUES (1, ?)")
      .run(JSON.stringify(DEFAULT_SETTINGS))
  }
}

// ─── Character CRUD ────────────────────────────────────────────────────────────

export interface CharacterRow {
  id: number
  name: string
  gender: string
  state_json: string
  created_at: string
  updated_at: string
}

export function listCharacters(): CharacterRow[] {
  return getDb().prepare("SELECT * FROM characters ORDER BY updated_at DESC").all() as CharacterRow[]
}

export function getCharacter(id: number): CharacterRow | undefined {
  return getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow | undefined
}

export function createCharacter(name: string, gender: string, state: MainCharacterState): number {
  const result = getDb()
    .prepare("INSERT INTO characters (name, gender, state_json) VALUES (?, ?, ?)")
    .run(name, gender, JSON.stringify(state))
  return result.lastInsertRowid as number
}

export function updateCharacter(id: number, name: string, gender: string, state: MainCharacterState): void {
  getDb()
    .prepare(
      "UPDATE characters SET name = ?, gender = ?, state_json = ?, updated_at = datetime('now') WHERE id = ?"
    )
    .run(name, gender, JSON.stringify(state), id)
}

export function deleteCharacter(id: number): void {
  getDb().prepare("DELETE FROM characters WHERE id = ?").run(id)
}

// ─── Story CRUD ────────────────────────────────────────────────────────────────

export interface StoryRow {
  id: number
  title: string
  opening_scenario: string
  character_state_json: string
  world_state_json: string
  npc_states_json: string
  created_at: string
  updated_at: string
}

export function listStories(): (StoryRow & { turn_count: number })[] {
  return getDb()
    .prepare(
      `SELECT s.*, COUNT(t.id) as turn_count
       FROM stories s
       LEFT JOIN turns t ON t.story_id = s.id
       GROUP BY s.id
       ORDER BY s.updated_at DESC`
    )
    .all() as (StoryRow & { turn_count: number })[]
}

export function getStory(id: number): StoryRow | undefined {
  return getDb().prepare("SELECT * FROM stories WHERE id = ?").get(id) as StoryRow | undefined
}

export function createStory(
  title: string,
  opening_scenario: string,
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[]
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO stories (title, opening_scenario, character_state_json, world_state_json, npc_states_json)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(title, opening_scenario, JSON.stringify(character), JSON.stringify(world), JSON.stringify(npcs))
  return result.lastInsertRowid as number
}

export function updateStory(
  id: number,
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[]
): void {
  getDb()
    .prepare(
      `UPDATE stories SET character_state_json = ?, world_state_json = ?, npc_states_json = ?,
       updated_at = datetime('now') WHERE id = ?`
    )
    .run(JSON.stringify(character), JSON.stringify(world), JSON.stringify(npcs), id)
}

export function updateStoryMeta(id: number, fields: { title?: string; opening_scenario?: string }): void {
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
  values.push(id)
  getDb()
    .prepare(`UPDATE stories SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values)
}

export function deleteStory(id: number): void {
  getDb().prepare("DELETE FROM stories WHERE id = ?").run(id)
}

// ─── Turns CRUD ────────────────────────────────────────────────────────────────

export interface TurnRow {
  id: number
  story_id: number
  turn_number: number
  player_input: string
  narrative_text: string
  character_snapshot_json: string
  world_snapshot_json: string
  npc_snapshot_json: string
  created_at: string
}

export function getTurnsForStory(story_id: number): TurnRow[] {
  return getDb()
    .prepare("SELECT * FROM turns WHERE story_id = ? ORDER BY turn_number ASC")
    .all(story_id) as TurnRow[]
}

export function getNextTurnNumber(story_id: number): number {
  const result = getDb()
    .prepare("SELECT COALESCE(MAX(turn_number), 0) + 1 as next FROM turns WHERE story_id = ?")
    .get(story_id) as { next: number }
  return result.next
}

export function createTurn(
  story_id: number,
  turn_number: number,
  player_input: string,
  narrative_text: string,
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[]
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO turns (story_id, turn_number, player_input, narrative_text,
       character_snapshot_json, world_snapshot_json, npc_snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      story_id,
      turn_number,
      player_input,
      narrative_text,
      JSON.stringify(character),
      JSON.stringify(world),
      JSON.stringify(npcs)
    )
  return result.lastInsertRowid as number
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSettings(): SettingsState {
  const row = getDb()
    .prepare("SELECT settings_json FROM settings WHERE id = 1")
    .get() as { settings_json: string } | undefined
  if (!row) return DEFAULT_SETTINGS
  try {
    return JSON.parse(row.settings_json) as SettingsState
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function updateSettings(settings: SettingsState): void {
  getDb()
    .prepare("UPDATE settings SET settings_json = ?, updated_at = datetime('now') WHERE id = 1")
    .run(JSON.stringify(settings))
}
