import { z } from "zod"
import { PersonalityTraitSchema } from "./personality-traits.js"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "./constants.js"
import {
  normalizeAppearance,
  normalizeCurrentScene,
  normalizeCurrentDate,
  normalizeLocations,
  normalizeNonEmptyString,
  normalizeGender,
  normalizePersonalityTraits,
  normalizeMemory,
  normalizeTimeOfDay,
  normalizeTraitList,
  stripSummaryLeak,
} from "./normalizers.js"
import { desc } from "./field-descriptions.js"
import { getServerDefaults } from "../core/strings.js"

export const InventoryItemSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.inventory_item.name")),
    description: z.string().min(1).describe(desc("state.inventory_item.description")),
  })
  .strict()
  .describe(desc("state.inventory_item.entry"))

export const LocationItemSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.inventory_item.name")),
    description: z.string().min(1).describe(desc("state.inventory_item.description")),
  })
  .strict()
  .describe(desc("state.location.available_item"))

const LocationCharacterSchema = z.string().min(1).describe(desc("state.location.character"))

export const LocationSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.location.name")),
    description: z.string().min(1).describe(desc("state.location.description")),
    characters: z.array(LocationCharacterSchema).describe(desc("state.location.characters")),
    available_items: z.array(LocationItemSchema).describe(desc("state.location.available_items")),
  })
  .strict()
  .describe(desc("state.location.entry"))

const LocationsSchema = z
  .array(LocationSchema)
  .min(1)
  .superRefine((locations, ctx) => {
    const seen = new Set<string>()
    locations.forEach((location, index) => {
      const key = location.name.trim().toLowerCase()
      if (!key) return
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Location names must be unique",
          path: [index, "name"],
        })
      } else {
        seen.add(key)
      }
    })
  })

const defaults = getServerDefaults()

export const CharacterAppearanceSchema = z
  .object({
    baseline_appearance: z.string().min(1).describe(desc("state.appearance.baseline_appearance")),
    current_appearance: z.string().min(1).describe(desc("state.appearance.current_appearance")),
    current_clothing: z.string().min(1).describe(desc("state.appearance.current_clothing")),
  })
  .strict()

const MajorFlawSchema = z.string().min(1).describe(desc("traits.major_flaw"))
const QuirkSchema = z.string().min(1).describe(desc("traits.quirk"))
const PerkSchema = z.string().min(1).describe(desc("traits.perk"))

export const MajorFlawsSchema = z.array(MajorFlawSchema).max(3).describe(desc("traits.major_flaws"))
export const QuirksSchema = z.array(QuirkSchema).max(6).describe(desc("traits.quirks"))
export const PerksSchema = z.array(PerkSchema).max(6).describe(desc("traits.perks"))

const PersonalityTraitsOptionalSchema = z
  .array(PersonalityTraitSchema)
  .max(5)
  .describe(desc("traits.personality_traits"))

const CharacterStateBaseSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.character.name")),
    race: z.string().min(1).describe(desc("state.character.race")),
    gender: z.string().min(1).describe(desc("state.character.gender")),
    general_description: z.string().optional().describe(desc("state.character.general_description")),
    current_location: z
      .string()
      .min(1)
      .optional()
      .default(defaults.unknown.location)
      .describe(desc("state.character.current_location")),
    appearance: CharacterAppearanceSchema.optional()
      .default({
        baseline_appearance: defaults.unknown.baselineAppearance,
        current_appearance: defaults.unknown.appearance,
        current_clothing: defaults.unknown.clothing,
      })
      .describe(desc("state.character.appearance")),
    personality_traits: PersonalityTraitsOptionalSchema.optional()
      .default([])
      .describe(desc("traits.personality_traits")),
    major_flaws: MajorFlawsSchema.optional().default([]).describe(desc("traits.major_flaws")),
    quirks: QuirksSchema.optional().default([]).describe(desc("traits.quirks")),
    perks: PerksSchema.optional().default([]).describe(desc("traits.perks")),
    inventory: z.array(InventoryItemSchema).optional().default([]).describe(desc("state.character.inventory")),
  })
  .strict()

export const CharacterStateSchema = CharacterStateBaseSchema

export const MainCharacterStateSchema = CharacterStateBaseSchema

export const NPCStateSchema = CharacterStateBaseSchema.extend({
  current_activity: z
    .string()
    .min(1)
    .optional()
    .default(defaults.unknown.activity)
    .describe(desc("state.character.current_activity")),
}).strict()

function normalizeInventoryItems(value: unknown): { name: string; description: string }[] {
  if (!Array.isArray(value)) return []
  const items: { name: string; description: string }[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const obj = entry as Record<string, unknown>
    const name = normalizeNonEmptyString(obj.name, "")
    if (!name) continue
    const description = normalizeNonEmptyString(obj.description, getServerDefaults().unknown.item)
    items.push({ name, description })
  }
  return items
}

const CharacterStateStoredBaseSchema = z
  .object({
    name: z.string().optional().describe(desc("state.character.name")),
    race: z.string().optional().describe(desc("state.character.race")),
    gender: z.string().optional().describe(desc("state.character.gender")),
    general_description: z.string().optional().describe(desc("state.character.general_description")),
    current_location: z.string().optional().describe(desc("state.character.current_location")),
    appearance: z.unknown().optional().describe(desc("state.character.appearance")),
    personality_traits: z.unknown().optional().describe(desc("traits.personality_traits")),
    major_flaws: z.unknown().optional().describe(desc("traits.major_flaws")),
    quirks: z.unknown().optional().describe(desc("traits.quirks")),
    perks: z.unknown().optional().describe(desc("traits.perks")),
    current_activity: z.string().optional().describe(desc("state.character.current_activity")),
    inventory: z.unknown().optional().describe(desc("state.character.inventory")),
  })
  .passthrough()
const normalizeCharacterStoredBase = (value: z.input<typeof CharacterStateStoredBaseSchema>) => ({
  name: normalizeNonEmptyString(value.name, getServerDefaults().unknown.npc),
  race: normalizeNonEmptyString(value.race, getServerDefaults().unknown.value),
  gender: normalizeGender(value.gender, getServerDefaults().unknown.value),
  general_description: normalizeNonEmptyString(
    value.general_description ?? (value as Record<string, unknown>).baseline_description,
    getServerDefaults().unknown.generalDescription,
  ),
  current_location: normalizeNonEmptyString(value.current_location, getServerDefaults().unknown.location),
  appearance: normalizeAppearance(value.appearance),
  personality_traits: normalizePersonalityTraits(value.personality_traits),
  major_flaws: normalizeTraitList(value.major_flaws, 3),
  quirks: normalizeTraitList(value.quirks ?? (value as Record<string, unknown>).custom_traits, 6),
  perks: normalizeTraitList(value.perks, 6),
  inventory: normalizeInventoryItems(value.inventory),
})

export const CharacterStateStoredSchema = CharacterStateStoredBaseSchema.transform((value) =>
  normalizeCharacterStoredBase(value),
).pipe(CharacterStateSchema)

export const MainCharacterStateStoredSchema = CharacterStateStoredSchema

export const NPCStateStoredSchema = CharacterStateStoredBaseSchema.transform((value) => ({
  ...normalizeCharacterStoredBase(value),
  current_activity: normalizeNonEmptyString(value.current_activity, getServerDefaults().unknown.activity),
})).pipe(NPCStateSchema)

export const WorldStateUpdateSchema = z
  .object({
    current_scene: z.string().min(1).optional().describe(desc("llm.world_state_update.current_scene")),
    current_date: z
      .string()
      .regex(DATE_REGEX, "current_date must be YYYY-MM-DD")
      .optional()
      .describe(desc("llm.world_state_update.current_date")),
    time_of_day: z
      .string()
      .regex(TIME_OF_DAY_REGEX, "time_of_day must be 24h HH:MM")
      .optional()
      .describe(desc("llm.world_state_update.time_of_day")),
    locations: LocationsSchema.optional().describe(desc("llm.world_state_update.locations")),
  })
  .describe(desc("llm.turn_response.world_state_update"))
  .strict()

export const WorldStateSchema = z
  .object({
    current_scene: z.string().min(1).describe(desc("llm.world_state_update.current_scene")),
    current_date: z
      .string()
      .regex(DATE_REGEX, "current_date must be YYYY-MM-DD")
      .describe(desc("llm.world_state_update.current_date")),
    time_of_day: z
      .string()
      .regex(TIME_OF_DAY_REGEX, "time_of_day must be 24h HH:MM")
      .describe(desc("llm.world_state_update.time_of_day")),
    memory: z
      .preprocess((value) => (typeof value === "string" ? stripSummaryLeak(value) : value), z.string().min(1))
      .describe(desc("llm.world_state_update.memory")),
    locations: LocationsSchema.describe(desc("llm.world_state_update.locations")),
  })
  .describe(desc("llm.turn_response.world_state_update"))
  .strict()

export const WorldStateStoredSchema = z
  .object({
    current_scene: z.string().optional().describe(desc("llm.world_state_update.current_scene")),
    current_date: z.string().optional().describe(desc("llm.world_state_update.current_date")),
    time_of_day: z.string().optional().describe(desc("llm.world_state_update.time_of_day")),
    memory: z.string().optional().describe(desc("llm.world_state_update.memory")),
    recent_events_summary: z.string().optional(),
    locations: z.unknown().optional().describe(desc("llm.world_state_update.locations")),
  })
  .passthrough()
  .transform((value) => {
    const currentScene = normalizeCurrentScene(value.current_scene)
    const legacyDayOfWeek = (value as Record<string, unknown>).day_of_week
    return {
      current_scene: currentScene,
      current_date: normalizeCurrentDate(value.current_date ?? legacyDayOfWeek),
      time_of_day: normalizeTimeOfDay(value.time_of_day),
      memory: normalizeMemory(value.memory ?? value.recent_events_summary),
      locations: normalizeLocations(value.locations, currentScene),
    }
  })
  .pipe(WorldStateSchema)
