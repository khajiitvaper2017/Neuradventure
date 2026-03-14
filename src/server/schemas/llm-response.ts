import { z } from "zod"
import { NPCStateUpdateBaseSchema } from "./npc-state-update-base.js"
import { InventoryItemSchema, WorldStateUpdateSchema } from "./game-state.js"
import { buildNpcCreationSchema } from "./npc-creation.js"

type NPCStateUpdateBase = z.infer<typeof NPCStateUpdateBaseSchema>

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
): z.ZodType<NPCStateUpdateBase> => {
  const base = NPCStateUpdateBaseSchema.extend({ name: nameSchema })
  const withRace = base.extend({ race: z.string().min(1) })
  const withGender = base.extend({ gender: z.string().min(1) })
  const variants: z.ZodType<NPCStateUpdateBase>[] = [withRace, withGender]
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
        set_current_activity: z.string().min(1),
      }),
    )
  }
  return z.union(
    variants as [z.ZodType<NPCStateUpdateBase>, z.ZodType<NPCStateUpdateBase>, ...z.ZodType<NPCStateUpdateBase>[]],
  )
}

export const NPCStateUpdateSchema = buildNPCStateUpdateSchema(z.string().min(1))

export const NPCCreationSchema = buildNpcCreationSchema({
  useNpcAppearance: true,
  useNpcPersonalityTraits: true,
  useNpcMajorFlaws: true,
  useNpcQuirks: true,
  useNpcPerks: true,
  useNpcLocation: true,
  useNpcActivity: true,
})

export const SetCurrentAppearanceSection = z.string().min(1)

export const CurrentClothingSection = z.string().min(1)

export const SetCurrentInventorySection = z.array(InventoryItemSchema)

export const BackgroundEventsSection = z.preprocess((value) => {
  if (typeof value !== "string") return value
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}, z.string().min(1).optional())

export const buildNPCChangesSection = (nameSchema: z.ZodType<string>, flags?: NPCUpdateFlags) => {
  const updateSchema = buildNPCStateUpdateSchema(nameSchema, flags)
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
    set_current_inventory: SetCurrentInventorySection.optional(),
    world_state_update: WorldStateUpdateSchema,
    npc_changes: NPCChangesSection.optional(),
    npc_introductions: NPCIntroductionsSection.optional(),
  })
  .strict()
