import { z } from "zod"
import { PersonalityTraitSchema } from "./personality-traits.js"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "./constants.js"
import {
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
import { getServerDefaults } from "../core/strings.js"

export const InventoryItemSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
  })
  .strict()

export const LocationItemSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
  })
  .strict()

const LocationCharacterSchema = z.string().min(1)

export const LocationSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
    characters: z.array(LocationCharacterSchema),
    available_items: z.array(LocationItemSchema),
  })
  .strict()

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

const MajorFlawSchema = z.string().min(1)
const QuirkSchema = z.string().min(1)
const PerkSchema = z.string().min(1)

export const MajorFlawsSchema = z.array(MajorFlawSchema).max(3)
export const QuirksSchema = z.array(QuirkSchema).max(6)
export const PerksSchema = z.array(PerkSchema).max(6)

const PersonalityTraitsOptionalSchema = z.array(PersonalityTraitSchema).max(5)

const CharacterStateBaseSchema = z
  .object({
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    general_description: z.string().optional(),
    current_location: z.string().min(1).optional().default(defaults.unknown.location),
    baseline_appearance: z.string().min(1).optional().default(defaults.unknown.baselineAppearance),
    current_appearance: z.string().min(1).optional().default(defaults.unknown.appearance),
    current_clothing: z.string().min(1).optional().default(defaults.unknown.clothing),
    personality_traits: PersonalityTraitsOptionalSchema.optional().default([]),
    major_flaws: MajorFlawsSchema.optional().default([]),
    quirks: QuirksSchema.optional().default([]),
    perks: PerksSchema.optional().default([]),
    inventory: z.array(InventoryItemSchema).optional().default([]),
  })
  .strict()

export const CharacterStateSchema = CharacterStateBaseSchema

export const MainCharacterStateSchema = CharacterStateBaseSchema

export const NPCStateSchema = CharacterStateBaseSchema.extend({
  current_activity: z.string().min(1).optional().default(defaults.unknown.activity),
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
    name: z.string().optional(),
    race: z.string().optional(),
    gender: z.string().optional(),
    general_description: z.string().optional(),
    current_location: z.string().optional(),
    baseline_appearance: z.string().optional(),
    current_appearance: z.string().optional(),
    current_clothing: z.string().optional(),
    personality_traits: z.unknown().optional(),
    major_flaws: z.unknown().optional(),
    quirks: z.unknown().optional(),
    perks: z.unknown().optional(),
    current_activity: z.string().optional(),
    inventory: z.unknown().optional(),
  })
  .passthrough()
const normalizeCharacterStoredBase = (value: z.input<typeof CharacterStateStoredBaseSchema>) => ({
  name: normalizeNonEmptyString(value.name, getServerDefaults().unknown.npc),
  race: normalizeNonEmptyString(value.race, getServerDefaults().unknown.value),
  gender: normalizeGender(value.gender, getServerDefaults().unknown.value),
  general_description: normalizeNonEmptyString(
    value.general_description,
    getServerDefaults().unknown.generalDescription,
  ),
  current_location: normalizeNonEmptyString(value.current_location, getServerDefaults().unknown.location),
  baseline_appearance: normalizeNonEmptyString(
    value.baseline_appearance,
    getServerDefaults().unknown.baselineAppearance,
  ),
  current_appearance: normalizeNonEmptyString(
    value.current_appearance ?? value.baseline_appearance,
    normalizeNonEmptyString(value.baseline_appearance, getServerDefaults().unknown.baselineAppearance) ||
      getServerDefaults().unknown.appearance,
  ),
  current_clothing: normalizeNonEmptyString(value.current_clothing, getServerDefaults().unknown.clothing),
  personality_traits: normalizePersonalityTraits(value.personality_traits),
  major_flaws: normalizeTraitList(value.major_flaws, 3),
  quirks: normalizeTraitList(value.quirks, 6),
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
    current_scene: z.string().min(1).optional(),
    current_date: z.string().regex(DATE_REGEX, "current_date must be YYYY-MM-DD").optional(),
    time_of_day: z.string().regex(TIME_OF_DAY_REGEX, "time_of_day must be 24h HH:MM").optional(),
    locations: LocationsSchema.optional(),
  })

  .strict()

export const WorldStateSchema = z
  .object({
    current_scene: z.string().min(1),
    current_date: z.string().regex(DATE_REGEX, "current_date must be YYYY-MM-DD"),
    time_of_day: z.string().regex(TIME_OF_DAY_REGEX, "time_of_day must be 24h HH:MM"),
    memory: z.preprocess((value) => (typeof value === "string" ? stripSummaryLeak(value) : value), z.string().min(1)),
    locations: LocationsSchema,
  })

  .strict()

export const WorldStateStoredSchema = z
  .object({
    current_scene: z.string().optional(),
    current_date: z.string().optional(),
    time_of_day: z.string().optional(),
    memory: z.string().optional(),
    locations: z.unknown().optional(),
  })
  .passthrough()
  .transform((value) => {
    const currentScene = normalizeCurrentScene(value.current_scene)
    return {
      current_scene: currentScene,
      current_date: normalizeCurrentDate(value.current_date),
      time_of_day: normalizeTimeOfDay(value.time_of_day),
      memory: normalizeMemory(value.memory),
      locations: normalizeLocations(value.locations, currentScene),
    }
  })
  .pipe(WorldStateSchema)
