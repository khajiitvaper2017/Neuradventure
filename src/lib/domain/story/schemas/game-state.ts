import { z } from "zod"
import { PersonalityTraitSchema } from "@/domain/story/schemas/personality-traits"
import { TIME_OF_DAY_REGEX } from "@/domain/story/schemas/constants"
import {
  normalizeCurrentLocation,
  normalizeNonEmptyString,
  normalizeGender,
  normalizePersonalityTraits,
  normalizeMemory,
  normalizeTimeOfDay,
  normalizeTraitList,
  normalizeCustomFields,
} from "@/domain/story/schemas/normalizers"
import { getServerDefaults } from "@/utils/text/strings"
import type { WorldState as SharedWorldState } from "@/types/types"

export const InventoryItemSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
  })
  .strict()

const defaults = getServerDefaults()

const MajorFlawSchema = z.string().min(1)
const PerkSchema = z.string().min(1)

export const MajorFlawsSchema = z.array(MajorFlawSchema)
export const PerksSchema = z.array(PerkSchema)

const PersonalityTraitsOptionalSchema = z.array(PersonalityTraitSchema)

const CustomFieldsSchema = z
  .record(z.string().min(1), z.union([z.string().min(1), z.array(z.string().min(1))]))
  .optional()
  .default({})

const CustomFieldsUpdateSchema = z
  .record(z.string().min(1), z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]))
  .optional()

const CharacterStateBaseSchema = z
  .object({
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    general_description: z.string().optional().default(defaults.unknown.generalDescription),
    current_location: z.string().min(1).optional().default(defaults.unknown.location),
    current_activity: z.string().min(1).optional().default(defaults.unknown.activity),
    baseline_appearance: z.string().min(1).optional().default(defaults.unknown.baselineAppearance),
    current_appearance: z.string().min(1).optional().default(defaults.unknown.appearance),
    current_clothing: z.string().min(1).optional().default(defaults.unknown.clothing),
    personality_traits: PersonalityTraitsOptionalSchema.optional().default([]),
    major_flaws: MajorFlawsSchema.optional().default([]),
    perks: PerksSchema.optional().default([]),
    inventory: z.array(InventoryItemSchema).optional().default([]),
    custom_fields: CustomFieldsSchema,
  })
  .strict()

export const CharacterStateSchema = CharacterStateBaseSchema

export const MainCharacterStateSchema = CharacterStateBaseSchema

export const NPCStateSchema = CharacterStateBaseSchema

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
    perks: z.unknown().optional(),
    current_activity: z.string().optional(),
    inventory: z.unknown().optional(),
    custom_fields: z.unknown().optional(),
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
  current_activity: normalizeNonEmptyString(value.current_activity, getServerDefaults().unknown.activity),
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
  major_flaws: normalizeTraitList(value.major_flaws),
  perks: normalizeTraitList(value.perks),
  inventory: normalizeInventoryItems(value.inventory),
  custom_fields: normalizeCustomFields(value.custom_fields),
})

export const CharacterStateStoredSchema = CharacterStateStoredBaseSchema.transform((value) =>
  normalizeCharacterStoredBase(value),
).transform((value) => CharacterStateSchema.parse(value))

export const MainCharacterStateStoredSchema = CharacterStateStoredSchema

export const NPCStateStoredSchema = CharacterStateStoredBaseSchema.transform((value) => ({
  ...normalizeCharacterStoredBase(value),
})).transform((value) => NPCStateSchema.parse(value))

export const WorldStateUpdateSchema = z
  .object({
    time_of_day: z.string().regex(TIME_OF_DAY_REGEX, "time_of_day must be 24h HH:MM").optional(),
    custom_fields: CustomFieldsUpdateSchema,
  })
  .strict()

export const WorldStateSchema: z.ZodType<SharedWorldState> = z
  .object({
    current_location: z.string().min(1),
    time_of_day: z.string().regex(TIME_OF_DAY_REGEX, "time_of_day must be 24h HH:MM"),
    memory: z.string().min(1),
    custom_fields: CustomFieldsSchema,
  })
  .strict()

export const WorldStateStoredSchema: z.ZodType<SharedWorldState> = z
  .object({
    current_location: z.string().optional(),
    time_of_day: z.string().optional(),
    memory: z.string().optional(),
    custom_fields: z.unknown().optional(),
  })
  .passthrough()
  .transform((value) => {
    const currentLocation = normalizeCurrentLocation(value.current_location)
    const normalized = {
      current_location: currentLocation,
      time_of_day: normalizeTimeOfDay(value.time_of_day),
      memory: normalizeMemory(value.memory),
      custom_fields: normalizeCustomFields(value.custom_fields),
    }
    return WorldStateSchema.parse(normalized)
  })
