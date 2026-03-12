import * as db from "../core/db.js"
import { normalizeStoryModules } from "../schemas/story-modules.js"
import type { StoryModules } from "../core/models.js"

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
