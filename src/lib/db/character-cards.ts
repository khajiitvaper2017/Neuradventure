import { getDb } from "@/db/connection"

export type CharacterCardFormat = "tavern-card-v2"

export interface CharacterCardRow {
  character_id: number
  format: CharacterCardFormat | string
  card_json: string
  avatar_data_url: string | null
  created_at: string
  updated_at: string
}

export interface CharacterCardSummary {
  format: CharacterCardFormat | string
  avatar?: string
  tags: string[]
  creator?: string
  character_version?: string
  greeting_count: number
  has_character_book: boolean
}

export function upsertCharacterCard(
  characterId: number,
  format: CharacterCardFormat,
  cardJson: string,
  avatarDataUrl?: string | null,
): void {
  if (avatarDataUrl === undefined) {
    getDb()
      .prepare(
        `INSERT INTO character_cards (character_id, format, card_json, avatar_data_url)
         VALUES (?, ?, ?, NULL)
         ON CONFLICT(character_id) DO UPDATE
           SET format = excluded.format,
               card_json = excluded.card_json,
               updated_at = datetime('now')`,
      )
      .run(characterId, format, cardJson)
    return
  }

  getDb()
    .prepare(
      `INSERT INTO character_cards (character_id, format, card_json, avatar_data_url)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(character_id) DO UPDATE
         SET format = excluded.format,
             card_json = excluded.card_json,
             avatar_data_url = excluded.avatar_data_url,
             updated_at = datetime('now')`,
    )
    .run(characterId, format, cardJson, avatarDataUrl)
}

export function getCharacterCard(characterId: number): CharacterCardRow | undefined {
  return getDb().prepare("SELECT * FROM character_cards WHERE character_id = ?").get(characterId) as
    | CharacterCardRow
    | undefined
}

function safeParseJson(value: string): unknown | null {
  try {
    return JSON.parse(value) as unknown
  } catch {
    return null
  }
}

export function getCharacterCardSummary(characterId: number): CharacterCardSummary | null {
  const row = getCharacterCard(characterId)
  if (!row) return null
  const avatarFromRow =
    typeof row.avatar_data_url === "string" && row.avatar_data_url.trim() ? row.avatar_data_url : undefined
  const parsed = safeParseJson(row.card_json)
  if (!parsed || typeof parsed !== "object") {
    return {
      format: row.format,
      avatar: avatarFromRow,
      tags: [],
      greeting_count: 0,
      has_character_book: false,
    }
  }

  const obj = parsed as Record<string, unknown>
  const data = obj.data && typeof obj.data === "object" ? (obj.data as Record<string, unknown>) : {}
  const avatar =
    typeof (data as { avatar?: unknown }).avatar === "string"
      ? String((data as { avatar?: unknown }).avatar)
      : typeof (obj as { avatar?: unknown }).avatar === "string"
        ? String((obj as { avatar?: unknown }).avatar)
        : undefined
  const tags = Array.isArray((data as { tags?: unknown }).tags)
    ? ((data as { tags?: unknown }).tags as unknown[]).filter((t): t is string => typeof t === "string")
    : []
  const creator =
    typeof (data as { creator?: unknown }).creator === "string"
      ? String((data as { creator?: unknown }).creator)
      : undefined
  const characterVersion =
    typeof (data as { character_version?: unknown }).character_version === "string"
      ? String((data as { character_version?: unknown }).character_version)
      : undefined
  const firstMes =
    typeof (data as { first_mes?: unknown }).first_mes === "string"
      ? String((data as { first_mes?: unknown }).first_mes)
      : ""
  const altGreetings = Array.isArray((data as { alternate_greetings?: unknown }).alternate_greetings)
    ? ((data as { alternate_greetings?: unknown }).alternate_greetings as unknown[]).filter(
        (t): t is string => typeof t === "string",
      )
    : []
  const greetingCount = (firstMes.trim() ? 1 : 0) + altGreetings.length

  const characterBook = (data as { character_book?: unknown }).character_book
  const hasCharacterBook =
    !!characterBook &&
    typeof characterBook === "object" &&
    Array.isArray((characterBook as { entries?: unknown }).entries) &&
    ((characterBook as { entries?: unknown }).entries as unknown[]).length > 0

  return {
    format: row.format,
    avatar: avatarFromRow ?? avatar,
    tags,
    creator,
    character_version: characterVersion,
    greeting_count: greetingCount,
    has_character_book: hasCharacterBook,
  }
}
