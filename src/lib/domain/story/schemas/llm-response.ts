import { z } from "zod"
import { InventoryItemSchema, WorldStateUpdateSchema } from "@/domain/story/schemas/game-state"
import { buildCharacterCreationSchema } from "@/domain/story/schemas/character-creation"

export type CharacterUpdateFlags = {
  allowLocation: boolean
  allowAppearance: boolean
  allowClothing: boolean
  allowActivity: boolean
  allowInventory: boolean
}

export const CharacterCreationSchema = buildCharacterCreationSchema({
  useAppearance: true,
  usePersonalityTraits: true,
  useMajorFlaws: true,
  usePerks: true,
  useLocation: true,
  useActivity: true,
  useInventory: true,
})

export const SetCurrentAppearanceSection = z.string().min(1)

export const CurrentClothingSection = z.string().min(1)

export const CurrentActivitySection = z.string().min(1).describe("{state.character.current_activity}")

export const SetCurrentInventorySection = z.array(InventoryItemSchema)

const TURN_CHARACTER_UPDATE_FIELD_DESCRIPTIONS = {
  current_activity: "{state.character.current_activity}",
  current_location: "{state.character.current_location}",
  current_clothing: "{state.character.current_clothing}",
  current_appearance: "{state.character.current_appearance}",
  inventory: "{state.character.inventory}",
} as const

export function buildCharacterUpdateSchema(
  flags: CharacterUpdateFlags,
  customFieldShape: Record<string, z.ZodTypeAny> = {},
): z.ZodType<Record<string, unknown>> {
  const shape: Record<string, z.ZodTypeAny> = {}

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

export const CharacterIntroductionsSection = z.array(CharacterCreationSchema)

export const TurnResponseSchema = z
  .object({
    narrative_text: z.string().min(1),
    background_events: BackgroundEventsSection,
    world_state_update: WorldStateUpdateSchema.optional().default({}),
    character_introductions: CharacterIntroductionsSection.optional(),
  })
  .strict()
