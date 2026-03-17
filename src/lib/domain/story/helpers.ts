import * as db from "@/db/core"
import { normalizeStoryModules } from "@/domain/story/schemas/story-modules"
import type { StoryModules } from "@/types/models"
import { TavernCardV2Schema, type CharacterBook } from "@/utils/converters/tavern"

export function getAuthorNote(story: db.StoryRow): {
  text: string
  depth: number
  position: number
  interval: number
  role: number
  embedState: boolean
  enabled: boolean
} {
  const settings = db.getSettings()
  const text = story.author_note ?? ""
  return {
    text,
    depth: story.author_note_depth ?? settings.defaultAuthorNoteDepth ?? 4,
    position: story.author_note_position ?? settings.defaultAuthorNotePosition ?? 1,
    interval: story.author_note_interval ?? settings.defaultAuthorNoteInterval ?? 1,
    role: story.author_note_role ?? settings.defaultAuthorNoteRole ?? 0,
    embedState: (story.author_note_embed_state ?? 0) === 1,
    enabled: settings.authorNoteEnabled !== false,
  }
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
