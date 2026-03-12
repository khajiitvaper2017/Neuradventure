import type { MainCharacterState } from "../models.js"
import { getDb } from "./connection.js"
import { createCharacter, normalizeCharacterBase } from "./characters.js"
import { DEFAULT_SETTINGS } from "./settings.js"

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
