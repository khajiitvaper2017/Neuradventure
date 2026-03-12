import { z } from "zod"
import { desc } from "./field-descriptions.js"

export const StoryModulesSchema = z
  .object({
    track_npcs: z.boolean().describe(desc("story_modules.track_npcs")),
    track_locations: z.boolean().describe(desc("story_modules.track_locations")),
    character_detail_mode: z.enum(["detailed", "general"]).describe(desc("story_modules.character_detail_mode")),
  })
  .strict()

export type StoryModules = z.infer<typeof StoryModulesSchema>

export function normalizeStoryModules(value: unknown, fallback: StoryModules): StoryModules {
  if (!value || typeof value !== "object") return fallback
  const raw = value as Record<string, unknown>
  return {
    track_npcs: typeof raw.track_npcs === "boolean" ? raw.track_npcs : fallback.track_npcs,
    track_locations: typeof raw.track_locations === "boolean" ? raw.track_locations : fallback.track_locations,
    character_detail_mode:
      raw.character_detail_mode === "general" || raw.character_detail_mode === "detailed"
        ? raw.character_detail_mode
        : fallback.character_detail_mode,
  }
}
