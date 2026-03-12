import Database from "better-sqlite3"
import fs from "node:fs"
import path from "path"
import { fileURLToPath } from "url"
import type { MainCharacterState, NPCState, StoryModules, WorldState } from "./models.js"
import { getServerDefaults } from "./strings.js"
import { normalizeGender } from "../schemas/normalizers.js"
import { normalizeStoryModules } from "../schemas/story-modules.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const DB_PATH = path.resolve(__dirname, "../../../data/neuradventure.db")

let db: Database.Database

export type CharacterBase = Omit<MainCharacterState, "inventory">

function normalizeCharacterBase(input: Partial<CharacterBase>): CharacterBase {
  const legacyAppearance = input.appearance as { physical_description?: string } | undefined
  const baselineAppearance = input.appearance?.baseline_appearance ?? legacyAppearance?.physical_description ?? ""
  const currentAppearance =
    input.appearance?.current_appearance ?? legacyAppearance?.physical_description ?? baselineAppearance ?? ""
  return {
    name: input.name ?? "",
    race: input.race ?? "",
    gender: normalizeGender(input.gender, ""),
    general_description: input.general_description ?? "",
    current_location: input.current_location ?? getServerDefaults().unknown.location,
    appearance: {
      baseline_appearance: baselineAppearance,
      current_appearance: currentAppearance,
      current_clothing: input.appearance?.current_clothing ?? "",
    },
    personality_traits: Array.isArray(input.personality_traits) ? input.personality_traits : [],
    major_flaws: Array.isArray(input.major_flaws) ? input.major_flaws : [],
    quirks: Array.isArray(input.quirks)
      ? input.quirks
      : Array.isArray((input as { custom_traits?: string[] }).custom_traits)
        ? ((input as { custom_traits?: string[] }).custom_traits ?? [])
        : [],
    perks: Array.isArray(input.perks) ? input.perks : [],
  }
}

function characterKey(base: CharacterBase): string {
  return JSON.stringify(normalizeCharacterBase(base))
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

export interface SettingsState {
  theme: "default" | "amoled"
  design: "classic" | "roboto"
  textJustify: boolean
  colorScheme: "gold" | "emerald" | "sapphire" | "crimson"
  defaultAuthorNote: string
  defaultAuthorNoteDepth: number
  storyDefaults: StoryModules
  connector: LLMConnector
  generation: GenerationParams
}

const DEFAULT_GENERATION: GenerationParams = {
  max_tokens: 1500,
  ctx_limit: 0,
  temperature: 0.85,
  top_k: 40,
  top_p: 0.95,
  min_p: 0.05,
  typical_p: 1.0,
  top_n_sigma: -1.0,
  repeat_penalty: 1.0,
  repeat_last_n: 64,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
  mirostat: 0,
  mirostat_tau: 5.0,
  mirostat_eta: 0.1,
  dynatemp_range: 0.0,
  dynatemp_exponent: 1.0,
  dry_multiplier: 0.0,
  dry_base: 1.75,
  dry_allowed_length: 2,
  dry_penalty_last_n: -1,
  xtc_probability: 0.0,
  xtc_threshold: 0.1,
  seed: -1,
}

const DEFAULT_SETTINGS: SettingsState = {
  theme: "default",
  design: "classic",
  textJustify: true,
  colorScheme: "gold",
  defaultAuthorNote: "Remember the instructions you were given at the beginning of this chat.",
  defaultAuthorNoteDepth: 4,
  storyDefaults: {
    track_npcs: true,
    track_locations: true,
    character_detail_mode: "detailed",
  },
  connector: {
    type: "koboldcpp",
    url: "http://localhost:5001/v1",
    api_key: "kobold",
  },
  generation: { ...DEFAULT_GENERATION },
}

export function getDb(): Database.Database {
  if (!db) {
    fs.mkdirSync(path.dirname(DB_PATH), { recursive: true })
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
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      character_key TEXT NOT NULL UNIQUE,
      state_json    TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stories (
      id                    INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id          INTEGER REFERENCES characters(id),
      title                 TEXT NOT NULL,
      opening_scenario      TEXT NOT NULL,
      character_state_json  TEXT NOT NULL,
      world_state_json      TEXT NOT NULL,
      npc_states_json       TEXT NOT NULL,
      story_modules_json    TEXT NOT NULL,
      initial_character_state_json  TEXT NOT NULL,
      initial_world_state_json      TEXT NOT NULL,
      initial_npc_states_json       TEXT NOT NULL,
      created_at            TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS turns (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id                  INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      turn_number               INTEGER NOT NULL,
      action_mode               TEXT NOT NULL DEFAULT 'do',
      active_variant_id         INTEGER,
      request_id                TEXT,
      player_input              TEXT NOT NULL,
      narrative_text            TEXT NOT NULL,
      character_snapshot_json   TEXT NOT NULL,
      world_snapshot_json       TEXT NOT NULL,
      npc_snapshot_json         TEXT NOT NULL,
      created_at                TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_turns_story ON turns(story_id, turn_number);

    CREATE TABLE IF NOT EXISTS turn_variants (
      id                        INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id                   INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      variant_index             INTEGER NOT NULL,
      narrative_text            TEXT NOT NULL,
      character_snapshot_json   TEXT NOT NULL,
      world_snapshot_json       TEXT NOT NULL,
      npc_snapshot_json         TEXT NOT NULL,
      created_at                TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_turn_variants_turn ON turn_variants(turn_id, variant_index);

    CREATE TABLE IF NOT EXISTS canceled_turns (
      story_id     INTEGER PRIMARY KEY REFERENCES stories(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      canceled_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS canceled_chat_exchanges (
      chat_id      INTEGER PRIMARY KEY REFERENCES chats(id) ON DELETE CASCADE,
      payload_json TEXT NOT NULL,
      canceled_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS settings (
      id            INTEGER PRIMARY KEY CHECK (id = 1),
      settings_json TEXT NOT NULL,
      updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chats (
      id                  INTEGER PRIMARY KEY AUTOINCREMENT,
      title               TEXT NOT NULL DEFAULT '',
      scenario            TEXT NOT NULL DEFAULT '',
      speaker_strategy    TEXT NOT NULL DEFAULT 'round_robin',
      next_speaker_index  INTEGER NOT NULL DEFAULT 0,
      created_at          TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at          TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_members (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id       INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role          TEXT NOT NULL,
      member_kind   TEXT NOT NULL,
      character_id  INTEGER REFERENCES characters(id),
      state_json    TEXT NOT NULL,
      sort_order    INTEGER NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_members_chat ON chat_members(chat_id, sort_order);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id           INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      message_index     INTEGER NOT NULL,
      speaker_member_id INTEGER NOT NULL REFERENCES chat_members(id) ON DELETE CASCADE,
      role              TEXT NOT NULL,
      content           TEXT NOT NULL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, message_index);
  `)

  const storyColumns = database.prepare("PRAGMA table_info(stories)").all() as { name: string }[]
  const storyColumnNames = new Set(storyColumns.map((c) => c.name))
  if (!storyColumnNames.has("initial_character_state_json")) {
    database.exec("ALTER TABLE stories ADD COLUMN initial_character_state_json TEXT")
  }
  if (!storyColumnNames.has("initial_world_state_json")) {
    database.exec("ALTER TABLE stories ADD COLUMN initial_world_state_json TEXT")
  }
  if (!storyColumnNames.has("initial_npc_states_json")) {
    database.exec("ALTER TABLE stories ADD COLUMN initial_npc_states_json TEXT")
  }
  if (!storyColumnNames.has("character_id")) {
    database.exec("ALTER TABLE stories ADD COLUMN character_id INTEGER REFERENCES characters(id)")
  }
  if (!storyColumnNames.has("author_note")) {
    database.exec("ALTER TABLE stories ADD COLUMN author_note TEXT NOT NULL DEFAULT ''")
  }
  if (!storyColumnNames.has("author_note_depth")) {
    database.exec("ALTER TABLE stories ADD COLUMN author_note_depth INTEGER NOT NULL DEFAULT 4")
  }
  if (!storyColumnNames.has("story_modules_json")) {
    const modulesJson = JSON.stringify(DEFAULT_SETTINGS.storyDefaults).replace(/'/g, "''")
    database.exec(`ALTER TABLE stories ADD COLUMN story_modules_json TEXT NOT NULL DEFAULT '${modulesJson}'`)
  }
  database.exec(`
    UPDATE stories
    SET initial_character_state_json = COALESCE(initial_character_state_json, character_state_json),
        initial_world_state_json = COALESCE(initial_world_state_json, world_state_json),
        initial_npc_states_json = COALESCE(initial_npc_states_json, npc_states_json)
  `)

  const storiesNeedingCharacter = database
    .prepare(
      `SELECT id, character_id, initial_character_state_json, character_state_json
       FROM stories
       WHERE character_id IS NULL`,
    )
    .all() as {
    id: number
    character_id: number | null
    initial_character_state_json: string | null
    character_state_json: string
  }[]
  for (const story of storiesNeedingCharacter) {
    const raw = story.initial_character_state_json ?? story.character_state_json
    try {
      const parsed = JSON.parse(raw) as Partial<MainCharacterState>
      const base = normalizeCharacterBase(parsed)
      const id = createCharacter(base)
      database.prepare("UPDATE stories SET character_id = ? WHERE id = ?").run(id, story.id)
    } catch (err) {
      console.warn(`[db] Failed to migrate character for story ${story.id}`, err)
    }
  }

  database.exec("CREATE INDEX IF NOT EXISTS idx_stories_character ON stories(character_id)")

  const turnColumns = database.prepare("PRAGMA table_info(turns)").all() as { name: string }[]
  const turnColumnNames = new Set(turnColumns.map((c) => c.name))
  if (!turnColumnNames.has("request_id")) {
    database.exec("ALTER TABLE turns ADD COLUMN request_id TEXT")
  }
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_request_id ON turns(request_id)")
  if (!turnColumnNames.has("action_mode")) {
    database.exec("ALTER TABLE turns ADD COLUMN action_mode TEXT NOT NULL DEFAULT 'do'")
  }
  if (!turnColumnNames.has("active_variant_id")) {
    database.exec("ALTER TABLE turns ADD COLUMN active_variant_id INTEGER")
  }

  database.exec(`
    INSERT INTO turn_variants (
      turn_id,
      variant_index,
      narrative_text,
      character_snapshot_json,
      world_snapshot_json,
      npc_snapshot_json,
      created_at
    )
    SELECT
      t.id,
      1,
      t.narrative_text,
      t.character_snapshot_json,
      t.world_snapshot_json,
      t.npc_snapshot_json,
      t.created_at
    FROM turns t
    WHERE NOT EXISTS (SELECT 1 FROM turn_variants tv WHERE tv.turn_id = t.id)
  `)

  database.exec(`
    UPDATE turns
    SET active_variant_id = COALESCE(
      active_variant_id,
      (SELECT tv.id FROM turn_variants tv WHERE tv.turn_id = turns.id ORDER BY tv.variant_index DESC LIMIT 1)
    )
  `)

  const chatColumns = database.prepare("PRAGMA table_info(chats)").all() as { name: string }[]
  const chatColumnNames = new Set(chatColumns.map((c) => c.name))
  if (chatColumns.length > 0) {
    if (!chatColumnNames.has("scenario")) {
      database.exec("ALTER TABLE chats ADD COLUMN scenario TEXT NOT NULL DEFAULT ''")
    }
    if (!chatColumnNames.has("speaker_strategy")) {
      database.exec("ALTER TABLE chats ADD COLUMN speaker_strategy TEXT NOT NULL DEFAULT 'round_robin'")
    }
    if (!chatColumnNames.has("next_speaker_index")) {
      database.exec("ALTER TABLE chats ADD COLUMN next_speaker_index INTEGER NOT NULL DEFAULT 0")
    }
    if (!chatColumnNames.has("updated_at")) {
      database.exec("ALTER TABLE chats ADD COLUMN updated_at TEXT NOT NULL DEFAULT (datetime('now'))")
    }
  }

  const chatMemberColumns = database.prepare("PRAGMA table_info(chat_members)").all() as { name: string }[]
  const chatMemberNames = new Set(chatMemberColumns.map((c) => c.name))
  if (chatMemberColumns.length > 0) {
    if (!chatMemberNames.has("member_kind")) {
      database.exec("ALTER TABLE chat_members ADD COLUMN member_kind TEXT NOT NULL DEFAULT 'character'")
    }
    if (!chatMemberNames.has("state_json")) {
      database.exec("ALTER TABLE chat_members ADD COLUMN state_json TEXT NOT NULL DEFAULT ''")
    }
    if (!chatMemberNames.has("sort_order")) {
      database.exec("ALTER TABLE chat_members ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0")
    }
  }

  const chatMessageColumns = database.prepare("PRAGMA table_info(chat_messages)").all() as { name: string }[]
  const chatMessageNames = new Set(chatMessageColumns.map((c) => c.name))
  if (chatMessageColumns.length > 0) {
    if (!chatMessageNames.has("message_index")) {
      database.exec("ALTER TABLE chat_messages ADD COLUMN message_index INTEGER NOT NULL DEFAULT 0")
    }
    if (!chatMessageNames.has("speaker_member_id")) {
      database.exec("ALTER TABLE chat_messages ADD COLUMN speaker_member_id INTEGER NOT NULL DEFAULT 0")
    }
    if (!chatMessageNames.has("role")) {
      database.exec("ALTER TABLE chat_messages ADD COLUMN role TEXT NOT NULL DEFAULT 'assistant'")
    }
  }

  const settingsRow = database.prepare("SELECT settings_json FROM settings WHERE id = 1").get() as
    | { settings_json: string }
    | undefined
  if (!settingsRow) {
    database.prepare("INSERT INTO settings (id, settings_json) VALUES (1, ?)").run(JSON.stringify(DEFAULT_SETTINGS))
  }
}

// ─── Characters CRUD ──────────────────────────────────────────────────────────

export interface CharacterRow {
  id: number
  character_key: string
  state_json: string
  created_at: string
  updated_at: string
}

export function createCharacter(base: CharacterBase): number {
  const normalized = normalizeCharacterBase(base)
  const key = characterKey(normalized)
  const database = getDb()
  database
    .prepare("INSERT OR IGNORE INTO characters (character_key, state_json) VALUES (?, ?)")
    .run(key, JSON.stringify(normalized))
  database.prepare("UPDATE characters SET updated_at = datetime('now') WHERE character_key = ?").run(key)
  const row = database.prepare("SELECT id FROM characters WHERE character_key = ?").get(key) as
    | { id: number }
    | undefined
  if (!row) throw new Error("Failed to create character")
  return row.id
}

export function getCharacter(id: number): CharacterRow | undefined {
  return getDb().prepare("SELECT * FROM characters WHERE id = ?").get(id) as CharacterRow | undefined
}

export function listCharacters(): CharacterRow[] {
  return getDb().prepare("SELECT * FROM characters ORDER BY updated_at DESC").all() as CharacterRow[]
}

export function listStoryCharacterRefs(): {
  id: number
  title: string
  updated_at: string
  character_id: number | null
}[] {
  return getDb().prepare("SELECT id, title, updated_at, character_id FROM stories ORDER BY updated_at DESC").all() as {
    id: number
    title: string
    updated_at: string
    character_id: number | null
  }[]
}

// ─── Story CRUD ────────────────────────────────────────────────────────────────

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
        author_note_depth
      )
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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

// ─── Turns CRUD ────────────────────────────────────────────────────────────────

export interface TurnRow {
  id: number
  story_id: number
  turn_number: number
  action_mode: string
  active_variant_id: number | null
  request_id: string | null
  player_input: string
  narrative_text: string
  character_snapshot_json: string
  world_snapshot_json: string
  npc_snapshot_json: string
  created_at: string
}

export interface TurnVariantRow {
  id: number
  turn_id: number
  variant_index: number
  narrative_text: string
  character_snapshot_json: string
  world_snapshot_json: string
  npc_snapshot_json: string
  created_at: string
}

export interface CanceledTurnVariantPayload {
  variant_index: number
  narrative_text: string
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

export interface CanceledTurnPayload {
  turn_number: number
  action_mode: string
  active_variant_index: number | null
  player_input: string
  narrative_text: string
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
  variants: CanceledTurnVariantPayload[]
}

export function getTurnsForStory(story_id: number): TurnRow[] {
  return getDb().prepare("SELECT * FROM turns WHERE story_id = ? ORDER BY turn_number ASC").all(story_id) as TurnRow[]
}

export function getTurn(id: number): TurnRow | undefined {
  return getDb().prepare("SELECT * FROM turns WHERE id = ?").get(id) as TurnRow | undefined
}

export function getTurnByRequestId(request_id: string): TurnRow | undefined {
  return getDb().prepare("SELECT * FROM turns WHERE request_id = ?").get(request_id) as TurnRow | undefined
}

export function getLastTurnForStory(story_id: number): TurnRow | undefined {
  return getDb().prepare("SELECT * FROM turns WHERE story_id = ? ORDER BY turn_number DESC LIMIT 1").get(story_id) as
    | TurnRow
    | undefined
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
  action_mode: string,
  request_id: string | null,
  player_input: string,
  narrative_text: string,
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO turns (story_id, turn_number, action_mode, request_id, player_input, narrative_text,
       character_snapshot_json, world_snapshot_json, npc_snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      story_id,
      turn_number,
      action_mode,
      request_id,
      player_input,
      narrative_text,
      JSON.stringify(character),
      JSON.stringify(world),
      JSON.stringify(npcs),
    )
  return result.lastInsertRowid as number
}

export function updateTurn(id: number, fields: { player_input?: string; narrative_text?: string }): boolean {
  const updates: string[] = []
  const values: unknown[] = []
  if (fields.player_input !== undefined) {
    updates.push("player_input = ?")
    values.push(fields.player_input)
  }
  if (fields.narrative_text !== undefined) {
    updates.push("narrative_text = ?")
    values.push(fields.narrative_text)
  }
  if (updates.length === 0) return false
  values.push(id)
  const result = getDb()
    .prepare(`UPDATE turns SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values)
  if (fields.narrative_text !== undefined) {
    const active = getDb().prepare("SELECT active_variant_id FROM turns WHERE id = ?").get(id) as
      | { active_variant_id: number | null }
      | undefined
    if (active?.active_variant_id) {
      getDb()
        .prepare("UPDATE turn_variants SET narrative_text = ? WHERE id = ?")
        .run(fields.narrative_text, active.active_variant_id)
    }
  }
  return result.changes > 0
}

export function updateTurnSnapshot(
  id: number,
  fields: {
    narrative_text: string
    character: MainCharacterState
    world: WorldState
    npcs: NPCState[]
    action_mode?: string
    active_variant_id?: number
  },
): boolean {
  const updates: string[] = [
    "narrative_text = ?",
    "character_snapshot_json = ?",
    "world_snapshot_json = ?",
    "npc_snapshot_json = ?",
  ]
  const values: unknown[] = [
    fields.narrative_text,
    JSON.stringify(fields.character),
    JSON.stringify(fields.world),
    JSON.stringify(fields.npcs),
  ]
  if (fields.action_mode !== undefined) {
    updates.push("action_mode = ?")
    values.push(fields.action_mode)
  }
  if (fields.active_variant_id !== undefined) {
    updates.push("active_variant_id = ?")
    values.push(fields.active_variant_id)
  }
  values.push(id)
  const result = getDb()
    .prepare(`UPDATE turns SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values)
  return result.changes > 0
}

export function deleteTurn(id: number): boolean {
  const result = getDb().prepare("DELETE FROM turns WHERE id = ?").run(id)
  return result.changes > 0
}

export function listTurnVariants(turn_id: number): TurnVariantRow[] {
  return getDb()
    .prepare("SELECT * FROM turn_variants WHERE turn_id = ? ORDER BY variant_index ASC")
    .all(turn_id) as TurnVariantRow[]
}

export function getTurnVariant(id: number): TurnVariantRow | undefined {
  return getDb().prepare("SELECT * FROM turn_variants WHERE id = ?").get(id) as TurnVariantRow | undefined
}

export function createTurnVariant(
  turn_id: number,
  narrative_text: string,
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
): { id: number; variant_index: number } {
  const next = getDb()
    .prepare("SELECT COALESCE(MAX(variant_index), 0) + 1 as next FROM turn_variants WHERE turn_id = ?")
    .get(turn_id) as { next: number }
  const result = getDb()
    .prepare(
      `INSERT INTO turn_variants (
        turn_id,
        variant_index,
        narrative_text,
        character_snapshot_json,
        world_snapshot_json,
        npc_snapshot_json
      )
      VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(turn_id, next.next, narrative_text, JSON.stringify(character), JSON.stringify(world), JSON.stringify(npcs))
  return { id: result.lastInsertRowid as number, variant_index: next.next }
}

export function setActiveTurnVariant(turn_id: number, variant_id: number): boolean {
  const result = getDb().prepare("UPDATE turns SET active_variant_id = ? WHERE id = ?").run(variant_id, turn_id)
  return result.changes > 0
}

export function saveCanceledTurn(story_id: number, payload: CanceledTurnPayload): void {
  getDb()
    .prepare(
      `INSERT INTO canceled_turns (story_id, payload_json)
       VALUES (?, ?)
       ON CONFLICT(story_id) DO UPDATE SET payload_json = excluded.payload_json, canceled_at = datetime('now')`,
    )
    .run(story_id, JSON.stringify(payload))
}

export function getCanceledTurn(story_id: number): CanceledTurnPayload | undefined {
  const row = getDb().prepare("SELECT payload_json FROM canceled_turns WHERE story_id = ?").get(story_id) as
    | { payload_json: string }
    | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.payload_json) as CanceledTurnPayload
  } catch {
    return undefined
  }
}

export function clearCanceledTurn(story_id: number): void {
  getDb().prepare("DELETE FROM canceled_turns WHERE story_id = ?").run(story_id)
}

export type CanceledChatExchangePayload = {
  messages: Array<{
    message_index: number
    speaker_member_id: number
    role: "user" | "assistant" | "system"
    content: string
  }>
  next_speaker_index: number
}

export function setCanceledChatExchange(chat_id: number, payload: CanceledChatExchangePayload): void {
  getDb()
    .prepare(
      `INSERT INTO canceled_chat_exchanges (chat_id, payload_json, canceled_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(chat_id) DO UPDATE SET payload_json = excluded.payload_json, canceled_at = datetime('now')`,
    )
    .run(chat_id, JSON.stringify(payload))
}

export function getCanceledChatExchange(chat_id: number): CanceledChatExchangePayload | undefined {
  const row = getDb().prepare("SELECT payload_json FROM canceled_chat_exchanges WHERE chat_id = ?").get(chat_id) as
    | { payload_json: string }
    | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.payload_json) as CanceledChatExchangePayload
  } catch {
    return undefined
  }
}

export function clearCanceledChatExchange(chat_id: number): void {
  getDb().prepare("DELETE FROM canceled_chat_exchanges WHERE chat_id = ?").run(chat_id)
}

// ─── Chats ───────────────────────────────────────────────────────────────────

export type ChatMemberState = Omit<MainCharacterState, "inventory"> | Omit<NPCState, "inventory">

export interface ChatRow {
  id: number
  title: string
  scenario: string
  speaker_strategy: string
  next_speaker_index: number
  created_at: string
  updated_at: string
}

export interface ChatMemberRow {
  id: number
  chat_id: number
  role: "player" | "ai"
  member_kind: "character" | "npc"
  character_id: number | null
  state_json: string
  sort_order: number
  created_at: string
}

export interface ChatMessageRow {
  id: number
  chat_id: number
  message_index: number
  speaker_member_id: number
  role: "user" | "assistant" | "system"
  content: string
  created_at: string
}

export interface ChatMemberInput {
  role: "player" | "ai"
  member_kind: "character" | "npc"
  character_id: number | null
  state: ChatMemberState
  sort_order: number
}

export function createChat(
  title: string,
  scenario: string,
  speaker_strategy: string,
  next_speaker_index: number,
  members: ChatMemberInput[],
): number {
  const database = getDb()
  const insertChat = database.prepare(
    `INSERT INTO chats (title, scenario, speaker_strategy, next_speaker_index)
     VALUES (?, ?, ?, ?)`,
  )
  const insertMember = database.prepare(
    `INSERT INTO chat_members (chat_id, role, member_kind, character_id, state_json, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const tx = database.transaction(() => {
    const result = insertChat.run(title, scenario, speaker_strategy, next_speaker_index)
    const chatId = result.lastInsertRowid as number
    for (const member of members) {
      insertMember.run(
        chatId,
        member.role,
        member.member_kind,
        member.character_id,
        JSON.stringify(member.state),
        member.sort_order,
      )
    }
    return chatId
  })
  return tx()
}

export function listChats(): (ChatRow & { message_count: number })[] {
  return getDb()
    .prepare(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM chats c
       LEFT JOIN chat_messages m ON m.chat_id = c.id
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
    )
    .all() as (ChatRow & { message_count: number })[]
}

export function getChat(id: number): ChatRow | undefined {
  return getDb().prepare("SELECT * FROM chats WHERE id = ?").get(id) as ChatRow | undefined
}

export function updateChat(id: number, data: { title?: string; scenario?: string }): void {
  const nextTitle = data.title ?? null
  const nextScenario = data.scenario ?? null
  getDb()
    .prepare(
      `UPDATE chats
       SET title = COALESCE(?, title),
           scenario = COALESCE(?, scenario),
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(nextTitle, nextScenario, id)
}

export function listChatMembers(chat_id: number): ChatMemberRow[] {
  return getDb()
    .prepare("SELECT * FROM chat_members WHERE chat_id = ? ORDER BY sort_order ASC, id ASC")
    .all(chat_id) as ChatMemberRow[]
}

export function listChatMessages(chat_id: number): ChatMessageRow[] {
  return getDb()
    .prepare("SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY message_index ASC")
    .all(chat_id) as ChatMessageRow[]
}

export function getChatMessage(id: number): ChatMessageRow | undefined {
  return getDb().prepare("SELECT * FROM chat_messages WHERE id = ?").get(id) as ChatMessageRow | undefined
}

export function updateChatMessage(id: number, content: string): void {
  getDb().prepare("UPDATE chat_messages SET content = ? WHERE id = ?").run(content, id)
  getDb()
    .prepare(
      "UPDATE chats SET updated_at = datetime('now') WHERE id = (SELECT chat_id FROM chat_messages WHERE id = ?)",
    )
    .run(id)
}

export function deleteChatMessage(id: number): void {
  const row = getDb().prepare("SELECT chat_id FROM chat_messages WHERE id = ?").get(id) as
    | { chat_id: number }
    | undefined
  getDb().prepare("DELETE FROM chat_messages WHERE id = ?").run(id)
  if (row) {
    getDb().prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(row.chat_id)
  }
}

export function updateChatNextSpeaker(chat_id: number, next_speaker_index: number): void {
  getDb()
    .prepare("UPDATE chats SET next_speaker_index = ?, updated_at = datetime('now') WHERE id = ?")
    .run(next_speaker_index, chat_id)
}

export function getNextChatMessageIndex(chat_id: number): number {
  const result = getDb()
    .prepare("SELECT COALESCE(MAX(message_index), 0) + 1 as next FROM chat_messages WHERE chat_id = ?")
    .get(chat_id) as { next: number }
  return result.next
}

export function appendChatMessage(
  chat_id: number,
  message_index: number,
  speaker_member_id: number,
  role: "user" | "assistant" | "system",
  content: string,
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO chat_messages (chat_id, message_index, speaker_member_id, role, content)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(chat_id, message_index, speaker_member_id, role, content)
  getDb().prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(chat_id)
  return result.lastInsertRowid as number
}

export function advanceChatSpeaker(chat_id: number, next_speaker_index: number): void {
  getDb()
    .prepare("UPDATE chats SET next_speaker_index = ?, updated_at = datetime('now') WHERE id = ?")
    .run(next_speaker_index, chat_id)
}

// ─── Settings ────────────────────────────────────────────────────────────────

export function getSettings(): SettingsState {
  const row = getDb().prepare("SELECT settings_json FROM settings WHERE id = 1").get() as
    | { settings_json: string }
    | undefined
  if (!row) return DEFAULT_SETTINGS
  try {
    const stored = JSON.parse(row.settings_json) as Partial<SettingsState>
    return {
      ...DEFAULT_SETTINGS,
      ...stored,
      storyDefaults: normalizeStoryModules(stored.storyDefaults, DEFAULT_SETTINGS.storyDefaults),
      connector: { ...DEFAULT_SETTINGS.connector, ...(stored.connector ?? {}) },
      generation: { ...DEFAULT_SETTINGS.generation, ...(stored.generation ?? {}) },
    }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function updateSettings(settings: SettingsState): void {
  getDb()
    .prepare("UPDATE settings SET settings_json = ?, updated_at = datetime('now') WHERE id = 1")
    .run(JSON.stringify(settings))
}
