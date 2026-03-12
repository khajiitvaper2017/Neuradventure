import { getServerDefaults } from "../strings.js"
import { normalizeGender } from "../../schemas/normalizers.js"
import { getDb } from "./connection.js"
import type { CharacterBase } from "./types.js"

export interface CharacterRow {
  id: number
  character_key: string
  state_json: string
  created_at: string
  updated_at: string
}

export function normalizeCharacterBase(input: Partial<CharacterBase>): CharacterBase {
  const baselineAppearance = input.appearance?.baseline_appearance ?? ""
  const currentAppearance = input.appearance?.current_appearance ?? baselineAppearance ?? ""
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
    quirks: Array.isArray(input.quirks) ? input.quirks : [],
    perks: Array.isArray(input.perks) ? input.perks : [],
  }
}

export function characterKey(base: CharacterBase): string {
  return JSON.stringify(normalizeCharacterBase(base))
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
