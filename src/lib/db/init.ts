import { getDb } from "@/db/connection"
import { ensurePromptTemplateDefaults } from "@/db/prompts"
import { DEFAULT_SETTINGS } from "@/db/settings"

function bootstrapSchema(): void {
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
      character_id    INTEGER PRIMARY KEY REFERENCES characters(id) ON DELETE CASCADE,
      format          TEXT NOT NULL,
      card_json       TEXT NOT NULL,
      avatar_data_url TEXT,
      created_at      TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS stories (
      id                           INTEGER PRIMARY KEY AUTOINCREMENT,
      character_id                 INTEGER REFERENCES characters(id),
      title                        TEXT NOT NULL,
      opening_scenario             TEXT NOT NULL,
      character_state_json         TEXT NOT NULL,
      world_state_json             TEXT NOT NULL,
      npc_states_json              TEXT NOT NULL,
      story_modules_json           TEXT NOT NULL,
      initial_character_state_json TEXT NOT NULL,
      initial_world_state_json     TEXT NOT NULL,
      initial_npc_states_json      TEXT NOT NULL,
      author_note                  TEXT NOT NULL DEFAULT '',
      author_note_depth            INTEGER NOT NULL DEFAULT 4,
      author_note_position         INTEGER NOT NULL DEFAULT 1,
      author_note_interval         INTEGER NOT NULL DEFAULT 1,
      author_note_role             INTEGER NOT NULL DEFAULT 0,
      author_note_embed_state      INTEGER NOT NULL DEFAULT 0,
      created_at                   TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at                   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS turns (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      story_id                INTEGER NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
      turn_number             INTEGER NOT NULL,
      action_mode             TEXT NOT NULL DEFAULT 'do',
      active_variant_id       INTEGER,
      request_id              TEXT,
      player_input            TEXT NOT NULL,
      narrative_text          TEXT NOT NULL,
      background_events       TEXT,
      character_snapshot_json TEXT NOT NULL,
      world_snapshot_json     TEXT NOT NULL,
      npc_snapshot_json       TEXT NOT NULL,
      created_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS turn_variants (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      turn_id                 INTEGER NOT NULL REFERENCES turns(id) ON DELETE CASCADE,
      variant_index           INTEGER NOT NULL,
      narrative_text          TEXT NOT NULL,
      background_events       TEXT,
      character_snapshot_json TEXT NOT NULL,
      world_snapshot_json     TEXT NOT NULL,
      npc_snapshot_json       TEXT NOT NULL,
      created_at              TEXT NOT NULL DEFAULT (datetime('now'))
    );

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

    CREATE TABLE IF NOT EXISTS prompt_configs (
      name        TEXT PRIMARY KEY,
      config_json TEXT NOT NULL,
      updated_at  TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );

    CREATE TABLE IF NOT EXISTS prompt_history (
      kind      TEXT NOT NULL,
      prompt    TEXT NOT NULL,
      last_used TEXT NOT NULL DEFAULT (datetime('now')),
      use_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (kind, prompt)
    );

    CREATE TABLE IF NOT EXISTS request_results (
      request_id    TEXT PRIMARY KEY,
      kind          TEXT NOT NULL,
      response_json TEXT NOT NULL,
      created_at    TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS sampler_presets (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      name        TEXT NOT NULL UNIQUE,
      description TEXT NOT NULL DEFAULT '',
      params_json TEXT NOT NULL,
      created_at  TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chats (
      id                 INTEGER PRIMARY KEY AUTOINCREMENT,
      title              TEXT NOT NULL DEFAULT '',
      scenario           TEXT NOT NULL DEFAULT '',
      speaker_strategy   TEXT NOT NULL DEFAULT 'round_robin',
      next_speaker_index INTEGER NOT NULL DEFAULT 0,
      created_at         TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at         TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_members (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id      INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      role         TEXT NOT NULL,
      member_kind  TEXT NOT NULL,
      character_id INTEGER REFERENCES characters(id),
      state_json   TEXT NOT NULL,
      sort_order   INTEGER NOT NULL,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS chat_messages (
      id                INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id           INTEGER NOT NULL REFERENCES chats(id) ON DELETE CASCADE,
      message_index     INTEGER NOT NULL,
      speaker_member_id INTEGER NOT NULL REFERENCES chat_members(id) ON DELETE CASCADE,
      role              TEXT NOT NULL,
      content           TEXT NOT NULL,
      created_at        TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS custom_fields (
      id         TEXT PRIMARY KEY,
      scope      TEXT NOT NULL,
      value_type TEXT NOT NULL,
      label      TEXT NOT NULL,
      placement  TEXT NOT NULL,
      prompt     TEXT NOT NULL DEFAULT '',
      enabled    INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS field_prompt_overrides (
      id             INTEGER PRIMARY KEY CHECK (id = 1),
      overrides_json TEXT NOT NULL,
      updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE INDEX IF NOT EXISTS idx_turns_story ON turns(story_id, turn_number);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_turns_request_id ON turns(request_id);
    CREATE INDEX IF NOT EXISTS idx_turn_variants_turn ON turn_variants(turn_id, variant_index);
    CREATE INDEX IF NOT EXISTS idx_prompt_history_kind_last_used ON prompt_history(kind, last_used DESC);
    CREATE INDEX IF NOT EXISTS idx_request_results_created ON request_results(created_at);
    CREATE INDEX IF NOT EXISTS idx_chat_members_chat ON chat_members(chat_id, sort_order);
    CREATE INDEX IF NOT EXISTS idx_chat_messages_chat ON chat_messages(chat_id, message_index);
    CREATE INDEX IF NOT EXISTS idx_stories_character ON stories(character_id);
    CREATE INDEX IF NOT EXISTS idx_custom_fields_scope_sort ON custom_fields(scope, sort_order, label);
  `)

  database
    .prepare("INSERT OR IGNORE INTO settings (id, settings_json) VALUES (1, ?)")
    .run(JSON.stringify(DEFAULT_SETTINGS))
  database.prepare("INSERT OR IGNORE INTO field_prompt_overrides (id, overrides_json) VALUES (1, ?)").run("{}")
  ensurePromptTemplateDefaults()
}

export function initDb() {
  bootstrapSchema()
}
