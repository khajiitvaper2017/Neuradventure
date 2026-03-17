import { z } from "zod"
import { NPCStateUpdateBaseSchema } from "@/domain/story/schemas/npc-state-update-base"
import { InventoryItemSchema, WorldStateUpdateSchema } from "@/domain/story/schemas/game-state"
import { buildNpcCreationSchema } from "@/domain/story/schemas/npc-creation"

type NPCStateUpdateOutput = z.infer<typeof NPCStateUpdateBaseSchema> & {
  custom_fields?: Record<string, string | string[]>
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
}

export const buildNPCStateUpdateSchema = (
  nameSchema: z.ZodType<string>,
  flags: NPCUpdateFlags = {
    allowLocation: true,
    allowAppearance: true,
    allowClothing: true,
    allowActivity: true,
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

export const SetCurrentInventorySection = z.array(InventoryItemSchema)

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
  customFieldsSchema: z.ZodTypeAny = CustomFieldsAnySchema,
) => {
  const updateSchema = buildNPCStateUpdateSchema(nameSchema, flags, customFieldsSchema)
  return z.array(updateSchema)
}
export const NPCChangesSection = buildNPCChangesSection(z.string().min(1))

export const NPCIntroductionsSection = z.array(NPCCreationSchema)

export const TurnResponseSchema = z
  .object({
    narrative_text: z.string().min(1),
    background_events: BackgroundEventsSection,
    current_clothing: CurrentClothingSection.optional(),
    current_appearance: SetCurrentAppearanceSection.optional(),
    current_inventory: SetCurrentInventorySection.optional(),
    character_custom_fields: CustomFieldsAnySchema.optional(),
    world_state_update: WorldStateUpdateSchema.optional().default({}),
    npc_changes: NPCChangesSection.optional(),
    npc_introductions: NPCIntroductionsSection.optional(),
  })
  .strict()
