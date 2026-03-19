import { z } from "zod"
import { MODULE_DEFS, STORY_MODULE_KEYS } from "@/domain/story/module-definitions"
import type { StoryModules as SharedStoryModules } from "@/types/types"

const storyModuleShape = Object.fromEntries(STORY_MODULE_KEYS.map((key) => [key, z.boolean()])) as Record<
  string,
  z.ZodTypeAny
>

export const StoryModulesSchema: z.ZodType<SharedStoryModules> = z
  .object({
    ...storyModuleShape,
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
  .strip() as unknown as z.ZodType<SharedStoryModules>

export type StoryModules = SharedStoryModules

export const DEFAULT_STORY_MODULES: StoryModules = {
  ...Object.fromEntries(
    MODULE_DEFS.map((def) => {
      if (def.id === "track_background_events") return [def.id, false]
      return [def.id, true]
    }),
  ),
  custom_field_modules: {},
} as StoryModules

export type ModuleFlags = {
  useCharAppearance: boolean
  useCharPersonalityTraits: boolean
  useCharMajorFlaws: boolean
  useCharPerks: boolean
  useCharInventory: boolean
  useCharMemories: boolean
  useCharLocation: boolean
  useCharActivity: boolean
  useNpcAppearance: boolean
  useNpcPersonalityTraits: boolean
  useNpcMajorFlaws: boolean
  useNpcPerks: boolean
  useNpcInventory: boolean
  useNpcMemories: boolean
  useNpcLocation: boolean
  useNpcActivity: boolean
}

export function resolveModuleFlags(modules: StoryModules): ModuleFlags {
  return {
    useCharAppearance: modules.character_appearance_clothing,
    useCharPersonalityTraits: modules.character_personality_traits,
    useCharMajorFlaws: modules.character_major_flaws,
    useCharPerks: modules.character_perks,
    useCharInventory: modules.character_inventory,
    useCharMemories: modules.character_memories,
    useCharLocation: modules.character_location,
    useCharActivity: modules.character_activity,
    useNpcAppearance: modules.npc_appearance_clothing,
    useNpcPersonalityTraits: modules.npc_personality_traits,
    useNpcMajorFlaws: modules.npc_major_flaws,
    useNpcPerks: modules.npc_perks,
    useNpcInventory: modules.npc_inventory,
    useNpcMemories: modules.npc_memories,
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
  const normalized = { ...fallback } as StoryModules
  for (const key of STORY_MODULE_KEYS) {
    normalized[key] = typeof raw[key] === "boolean" ? (raw[key] as boolean) : fallback[key]
  }
  normalized.custom_field_modules = custom_field_modules
  return normalized
}
