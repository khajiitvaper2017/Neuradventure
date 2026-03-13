import { getDb } from "./connection.js"
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

    CREATE TABLE IF NOT EXISTS character_cards (
      character_id  INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      format        TEXT NOT NULL,
      card_json     TEXT NOT NULL,
      avatar_data_url TEXT,
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
      author_note           TEXT NOT NULL DEFAULT '',
      author_note_depth     INTEGER NOT NULL DEFAULT 4,
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
  // Lightweight migrations for existing installs (no schema versioning yet).
  const cardCols = database.prepare("PRAGMA table_info(character_cards)").all() as Array<{ name: string }>
  if (!cardCols.some((c) => c.name === "avatar_data_url")) {
    database.exec("ALTER TABLE character_cards ADD COLUMN avatar_data_url TEXT")
  }
  database.exec("CREATE INDEX IF NOT EXISTS idx_stories_character ON stories(character_id)")
  database.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_request_id ON turns(request_id)")

  const settingsRow = database.prepare("SELECT settings_json FROM settings WHERE id = 1").get() as
    | { settings_json: string }
    | undefined
  if (!settingsRow) {
    database.prepare("INSERT INTO settings (id, settings_json) VALUES (1, ?)").run(JSON.stringify(DEFAULT_SETTINGS))
  }
}
