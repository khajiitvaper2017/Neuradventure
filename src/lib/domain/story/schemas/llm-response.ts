import { z } from "zod"
import { NPCStateUpdateBaseSchema } from "@/domain/story/schemas/npc-state-update-base"
import { InventoryItemSchema, WorldStateUpdateSchema } from "@/domain/story/schemas/game-state"
import { buildNpcCreationSchema } from "@/domain/story/schemas/npc-creation"

type NPCStateUpdateOutput = z.infer<typeof NPCStateUpdateBaseSchema> & {
  custom_fields?: Record<string, string | string[]>
  inventory?: Array<{ name: string; description: string }>
}

const CustomFieldsAnySchema = z.record(
  z.string().min(1),
  z.union([z.string().min(1), z.array(z.string().min(1)).min(1)]),
)

export type NPCUpdateFlags = {
  allowLocation: boolean
  allowAppearance: boolean
  allowClothing: boolean
  allowActivity: boolean
  allowInventory: boolean
}

export type CharacterTurnUpdateFlags = NPCUpdateFlags & {
  allowRace: boolean
  allowGender: boolean
}

export const buildNPCStateUpdateSchema = (
  nameSchema: z.ZodType<string>,
  flags: NPCUpdateFlags = {
    allowLocation: true,
    allowAppearance: true,
    allowClothing: true,
    allowActivity: true,
    allowInventory: true,
  },
  customFieldsSchema?: z.ZodTypeAny,
): z.ZodType<NPCStateUpdateOutput> => {
  const base = NPCStateUpdateBaseSchema.extend({ name: nameSchema })
  const withRace = base.extend({ race: z.string().min(1) })
  const withGender = base.extend({ gender: z.string().min(1) })
  const variants: z.ZodTypeAny[] = [withRace, withGender]
  if (flags.allowLocation) {
    variants.push(
      base.extend({
        current_location: z.string().min(1),
      }),
    )
  }
  if (flags.allowAppearance) {
    variants.push(
      base.extend({
        current_appearance: z.string().min(1),
      }),
    )
  }
  if (flags.allowClothing) {
    variants.push(
      base.extend({
        current_clothing: z.string().min(1),
      }),
    )
  }
  if (flags.allowActivity) {
    variants.push(
      base.extend({
        current_activity: z.string().min(1),
      }),
    )
  }
  if (flags.allowInventory) {
    variants.push(
      base.extend({
        inventory: z.array(InventoryItemSchema).describe("{state.character.inventory}"),
      }),
    )
  }
  if (customFieldsSchema) {
    variants.push(
      base.extend({
        custom_fields: customFieldsSchema,
      }),
    )
  }
  return z.union(variants as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]]) as z.ZodType<NPCStateUpdateOutput>
}

export const NPCStateUpdateSchema = buildNPCStateUpdateSchema(z.string().min(1), undefined, CustomFieldsAnySchema)

export const NPCCreationSchema = buildNpcCreationSchema({
  useNpcAppearance: true,
  useNpcPersonalityTraits: true,
  useNpcMajorFlaws: true,
  useNpcPerks: true,
  useNpcLocation: true,
  useNpcActivity: true,
})

export const SetCurrentAppearanceSection = z.string().min(1)

export const CurrentClothingSection = z.string().min(1)

export const CurrentActivitySection = z.string().min(1).describe("{state.character.current_activity}")

export const SetCurrentInventorySection = z.array(InventoryItemSchema)

const TURN_CHARACTER_UPDATE_FIELD_DESCRIPTIONS = {
  race: "{state.character.race}",
  gender: "{state.character.gender}",
  current_activity: "{state.character.current_activity}",
  current_location: "{state.character.current_location}",
  current_clothing: "{state.character.current_clothing}",
  current_appearance: "{state.character.current_appearance}",
  inventory: "{state.character.inventory}",
} as const

export function buildTurnCharacterUpdateSchema(
  flags: CharacterTurnUpdateFlags,
  customFieldShape: Record<string, z.ZodTypeAny> = {},
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {}

  if (flags.allowRace) shape.race = z.string().min(1).optional().describe(TURN_CHARACTER_UPDATE_FIELD_DESCRIPTIONS.race)
  if (flags.allowGender)
    shape.gender = z.string().min(1).optional().describe(TURN_CHARACTER_UPDATE_FIELD_DESCRIPTIONS.gender)
  if (flags.allowActivity)
    shape.current_activity = z
      .string()
      .min(1)
      .optional()
      .describe(TURN_CHARACTER_UPDATE_FIELD_DESCRIPTIONS.current_activity)
  if (flags.allowLocation)
    shape.current_location = z
      .string()
      .min(1)
      .optional()
      .describe(TURN_CHARACTER_UPDATE_FIELD_DESCRIPTIONS.current_location)
  if (flags.allowClothing)
    shape.current_clothing = z
      .string()
      .min(1)
      .optional()
      .describe(TURN_CHARACTER_UPDATE_FIELD_DESCRIPTIONS.current_clothing)
  if (flags.allowAppearance)
    shape.current_appearance = z
      .string()
      .min(1)
      .optional()
      .describe(TURN_CHARACTER_UPDATE_FIELD_DESCRIPTIONS.current_appearance)
  if (flags.allowInventory)
    shape.inventory = z
      .array(InventoryItemSchema)
      .optional()
      .describe(TURN_CHARACTER_UPDATE_FIELD_DESCRIPTIONS.inventory)

  Object.assign(shape, customFieldShape)

  return z
    .object(shape)
    .strict()
    .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
      message: "Include at least one changed field.",
    }) as z.ZodType<Record<string, unknown>>
}

export const BackgroundEventsSection = z
  .preprocess((value) => {
    if (typeof value !== "string") return value
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : undefined
  }, z.string().min(1))
  .optional()

export const buildNPCChangesSection = (
  nameSchema: z.ZodType<string>,
  flags?: NPCUpdateFlags,
  customFieldsSchema?: z.ZodTypeAny,
) => {
  const updateSchema = buildNPCStateUpdateSchema(nameSchema, flags, customFieldsSchema)
  return z.array(updateSchema)
}
export const NPCChangesSection = buildNPCChangesSection(z.string().min(1), undefined, CustomFieldsAnySchema)

export const NPCIntroductionsSection = z.array(NPCCreationSchema)

export const TurnResponseSchema = z
  .object({
    narrative_text: z.string().min(1),
    background_events: BackgroundEventsSection,
    world_state_update: WorldStateUpdateSchema.optional().default({}),
    npc_introductions: NPCIntroductionsSection.optional(),
  })
  .strict()
