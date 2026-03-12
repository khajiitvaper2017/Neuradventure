import { z } from "zod"
import { desc } from "./field-descriptions.js"

export const StoryModulesSchema = z
  .object({
    track_npcs: z.boolean().describe(desc("story_modules.track_npcs")),
    track_locations: z.boolean().describe(desc("story_modules.track_locations")),
    character_detail_mode: z.enum(["detailed", "general"]).describe(desc("story_modules.character_detail_mode")),
    character_appearance_clothing: z.boolean().describe(desc("story_modules.character_appearance_clothing")),
    character_personality_traits: z.boolean().describe(desc("story_modules.character_personality_traits")),
    character_major_flaws: z.boolean().describe(desc("story_modules.character_major_flaws")),
    character_quirks: z.boolean().describe(desc("story_modules.character_quirks")),
    character_perks: z.boolean().describe(desc("story_modules.character_perks")),
    character_inventory: z.boolean().describe(desc("story_modules.character_inventory")),
    npc_appearance_clothing: z.boolean().describe(desc("story_modules.npc_appearance_clothing")),
    npc_personality_traits: z.boolean().describe(desc("story_modules.npc_personality_traits")),
    npc_major_flaws: z.boolean().describe(desc("story_modules.npc_major_flaws")),
    npc_quirks: z.boolean().describe(desc("story_modules.npc_quirks")),
    npc_perks: z.boolean().describe(desc("story_modules.npc_perks")),
    npc_location: z.boolean().describe(desc("story_modules.npc_location")),
    npc_activity: z.boolean().describe(desc("story_modules.npc_activity")),
  })
  .strict()

export type StoryModules = z.infer<typeof StoryModulesSchema>

export const DEFAULT_STORY_MODULES: StoryModules = {
  track_npcs: true,
  track_locations: true,
  character_detail_mode: "detailed",
  character_appearance_clothing: true,
  character_personality_traits: true,
  character_major_flaws: true,
  character_quirks: true,
  character_perks: true,
  character_inventory: true,
  npc_appearance_clothing: true,
  npc_personality_traits: true,
  npc_major_flaws: true,
  npc_quirks: true,
  npc_perks: true,
  npc_location: true,
  npc_activity: true,
}

export type ModuleFlags = {
  useCharAppearance: boolean
  useCharPersonalityTraits: boolean
  useCharMajorFlaws: boolean
  useCharQuirks: boolean
  useCharPerks: boolean
  useCharInventory: boolean
  useNpcAppearance: boolean
  useNpcPersonalityTraits: boolean
  useNpcMajorFlaws: boolean
  useNpcQuirks: boolean
  useNpcPerks: boolean
  useNpcLocation: boolean
  useNpcActivity: boolean
}

export function resolveModuleFlags(modules: StoryModules): ModuleFlags {
  const useCharAppearance = modules.character_detail_mode === "detailed"
  return {
    useCharAppearance,
    useCharPersonalityTraits: modules.character_personality_traits,
    useCharMajorFlaws: modules.character_major_flaws,
    useCharQuirks: modules.character_quirks,
    useCharPerks: modules.character_perks,
    useCharInventory: modules.character_inventory,
    useNpcAppearance: modules.npc_appearance_clothing,
    useNpcPersonalityTraits: modules.npc_personality_traits,
    useNpcMajorFlaws: modules.npc_major_flaws,
    useNpcQuirks: modules.npc_quirks,
    useNpcPerks: modules.npc_perks,
    useNpcLocation: modules.npc_location,
    useNpcActivity: modules.npc_activity,
  }
}

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
    character_appearance_clothing:
      typeof raw.character_appearance_clothing === "boolean"
        ? raw.character_appearance_clothing
        : fallback.character_appearance_clothing,
    character_personality_traits:
      typeof raw.character_personality_traits === "boolean"
        ? raw.character_personality_traits
        : fallback.character_personality_traits,
    character_major_flaws:
      typeof raw.character_major_flaws === "boolean" ? raw.character_major_flaws : fallback.character_major_flaws,
    character_quirks: typeof raw.character_quirks === "boolean" ? raw.character_quirks : fallback.character_quirks,
    character_perks: typeof raw.character_perks === "boolean" ? raw.character_perks : fallback.character_perks,
    character_inventory:
      typeof raw.character_inventory === "boolean" ? raw.character_inventory : fallback.character_inventory,
    npc_appearance_clothing:
      typeof raw.npc_appearance_clothing === "boolean" ? raw.npc_appearance_clothing : fallback.npc_appearance_clothing,
    npc_personality_traits:
      typeof raw.npc_personality_traits === "boolean" ? raw.npc_personality_traits : fallback.npc_personality_traits,
    npc_major_flaws: typeof raw.npc_major_flaws === "boolean" ? raw.npc_major_flaws : fallback.npc_major_flaws,
    npc_quirks: typeof raw.npc_quirks === "boolean" ? raw.npc_quirks : fallback.npc_quirks,
    npc_perks: typeof raw.npc_perks === "boolean" ? raw.npc_perks : fallback.npc_perks,
    npc_location: typeof raw.npc_location === "boolean" ? raw.npc_location : fallback.npc_location,
    npc_activity: typeof raw.npc_activity === "boolean" ? raw.npc_activity : fallback.npc_activity,
  }
}
