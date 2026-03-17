import { z } from "zod"

export const StoryModulesSchema = z
  .object({
    track_npcs: z.boolean(),
    track_background_events: z.boolean(),
    character_appearance_clothing: z.boolean(),
    character_personality_traits: z.boolean(),
    character_major_flaws: z.boolean(),
    character_perks: z.boolean(),
    character_inventory: z.boolean(),
    character_location: z.boolean(),
    character_activity: z.boolean(),
    npc_appearance_clothing: z.boolean(),
    npc_personality_traits: z.boolean(),
    npc_major_flaws: z.boolean(),
    npc_perks: z.boolean(),
    npc_inventory: z.boolean(),
    npc_location: z.boolean(),
    npc_activity: z.boolean(),
    custom_field_modules: z
      .record(
        z.string().trim().min(1),
        z
          .object({
            character: z.boolean().optional(),
            npc: z.boolean().optional(),
          })
          .strip(),
      )
      .optional(),
  })
  .strip()

export type StoryModules = z.infer<typeof StoryModulesSchema>

export const DEFAULT_STORY_MODULES: StoryModules = {
  track_npcs: true,
  track_background_events: false,
  character_appearance_clothing: true,
  character_personality_traits: true,
  character_major_flaws: true,
  character_perks: true,
  character_inventory: true,
  character_location: true,
  character_activity: true,
  npc_appearance_clothing: true,
  npc_personality_traits: true,
  npc_major_flaws: true,
  npc_perks: true,
  npc_inventory: true,
  npc_location: true,
  npc_activity: true,
  custom_field_modules: {},
}

export type ModuleFlags = {
  useCharAppearance: boolean
  useCharPersonalityTraits: boolean
  useCharMajorFlaws: boolean
  useCharPerks: boolean
  useCharInventory: boolean
  useCharLocation: boolean
  useCharActivity: boolean
  useNpcAppearance: boolean
  useNpcPersonalityTraits: boolean
  useNpcMajorFlaws: boolean
  useNpcPerks: boolean
  useNpcInventory: boolean
  useNpcLocation: boolean
  useNpcActivity: boolean
}

export function resolveModuleFlags(modules: StoryModules): ModuleFlags {
  const useCharAppearance = modules.character_appearance_clothing
  return {
    useCharAppearance,
    useCharPersonalityTraits: modules.character_personality_traits,
    useCharMajorFlaws: modules.character_major_flaws,
    useCharPerks: modules.character_perks,
    useCharInventory: modules.character_inventory,
    useCharLocation: modules.character_location,
    useCharActivity: modules.character_activity,
    useNpcAppearance: modules.npc_appearance_clothing,
    useNpcPersonalityTraits: modules.npc_personality_traits,
    useNpcMajorFlaws: modules.npc_major_flaws,
    useNpcPerks: modules.npc_perks,
    useNpcInventory: modules.npc_inventory,
    useNpcLocation: modules.npc_location,
    useNpcActivity: modules.npc_activity,
  }
}

export function normalizeStoryModules(value: unknown, fallback: StoryModules): StoryModules {
  if (!value || typeof value !== "object") return fallback
  const raw = value as Record<string, unknown>
  const rawCustom = raw.custom_field_modules
  const custom_field_modules: StoryModules["custom_field_modules"] = (() => {
    if (!rawCustom || typeof rawCustom !== "object" || Array.isArray(rawCustom)) return {}
    const out: Record<string, { character?: boolean; npc?: boolean }> = {}
    for (const [id, entry] of Object.entries(rawCustom as Record<string, unknown>)) {
      if (!id || typeof id !== "string") continue
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue
      const e = entry as Record<string, unknown>
      const character = typeof e.character === "boolean" ? e.character : undefined
      const npc = typeof e.npc === "boolean" ? e.npc : undefined
      if (character === undefined && npc === undefined) continue
      out[id] = {
        ...(out[id] ?? {}),
        ...(character !== undefined ? { character } : {}),
        ...(npc !== undefined ? { npc } : {}),
      }
    }
    return out
  })()
  return {
    track_npcs: typeof raw.track_npcs === "boolean" ? raw.track_npcs : fallback.track_npcs,
    track_background_events:
      typeof raw.track_background_events === "boolean" ? raw.track_background_events : fallback.track_background_events,
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
    character_perks: typeof raw.character_perks === "boolean" ? raw.character_perks : fallback.character_perks,
    character_inventory:
      typeof raw.character_inventory === "boolean" ? raw.character_inventory : fallback.character_inventory,
    character_location:
      typeof raw.character_location === "boolean" ? raw.character_location : fallback.character_location,
    character_activity:
      typeof raw.character_activity === "boolean" ? raw.character_activity : fallback.character_activity,
    npc_appearance_clothing:
      typeof raw.npc_appearance_clothing === "boolean" ? raw.npc_appearance_clothing : fallback.npc_appearance_clothing,
    npc_personality_traits:
      typeof raw.npc_personality_traits === "boolean" ? raw.npc_personality_traits : fallback.npc_personality_traits,
    npc_major_flaws: typeof raw.npc_major_flaws === "boolean" ? raw.npc_major_flaws : fallback.npc_major_flaws,
    npc_perks: typeof raw.npc_perks === "boolean" ? raw.npc_perks : fallback.npc_perks,
    npc_inventory: typeof raw.npc_inventory === "boolean" ? raw.npc_inventory : fallback.npc_inventory,
    npc_location: typeof raw.npc_location === "boolean" ? raw.npc_location : fallback.npc_location,
    npc_activity: typeof raw.npc_activity === "boolean" ? raw.npc_activity : fallback.npc_activity,
    custom_field_modules,
  }
}
