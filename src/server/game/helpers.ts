import * as db from "../core/db.js"
import { normalizeStoryModules } from "../schemas/story-modules.js"
import type { StoryModules } from "../core/models.js"
import { TavernCardV2Schema, type CharacterBook } from "../utils/converters/tavern.js"

export function getAuthorNote(story: db.StoryRow): { text: string; depth: number } | null {
  const text = story.author_note ?? ""
  if (!text.trim()) return null
  return { text, depth: story.author_note_depth ?? 4 }
}

export function getStoryModules(story: db.StoryRow): StoryModules {
  const defaults = db.getSettings().storyDefaults
  try {
    const raw = story.story_modules_json ? JSON.parse(story.story_modules_json) : null
    return normalizeStoryModules(raw, defaults)
  } catch {
    return defaults
  }
}

export function getStoryCharacterBook(story: db.StoryRow): CharacterBook | null {
  const characterId = story.character_id
  if (!characterId) return null
  const row = db.getCharacterCard(characterId)
  if (!row) return null
  try {
    const stored = JSON.parse(row.card_json) as unknown
    const card = TavernCardV2Schema.parse(stored)
    return card.data.character_book ?? null
  } catch {
    return null
  }
}
