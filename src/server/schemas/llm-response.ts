import { z } from "zod"
import { NPCStateUpdateBaseSchema } from "./npc-state-update-base.js"
import { InventoryItemSchema, WorldStateUpdateSchema } from "./game-state.js"
import { desc } from "./field-descriptions.js"
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
  const withRace = base.extend({ race: z.string().min(1).describe(desc("llm.npc_update.race")) })
  const withGender = base.extend({ gender: z.string().min(1).describe(desc("llm.npc_update.gender")) })
  const variants: z.ZodType<NPCStateUpdateBase>[] = [withRace, withGender]
  if (flags.allowLocation) {
    variants.push(
      base.extend({
        set_current_location: z.string().min(1).describe(desc("llm.npc_update.set_current_location")),
      }),
    )
  }
  if (flags.allowAppearance) {
    variants.push(
      base.extend({
        set_current_appearance: z.string().min(1).describe(desc("llm.npc_update.set_current_appearance")),
      }),
    )
  }
  if (flags.allowClothing) {
    variants.push(
      base.extend({
        current_clothing: z.string().min(1).describe(desc("state.appearance.current_clothing")),
      }),
    )
  }
  if (flags.allowActivity) {
    variants.push(
      base.extend({
        set_current_activity: z.string().min(1).describe(desc("llm.npc_update.set_current_activity")),
      }),
    )
  }
  return z.union(
    variants as [z.ZodType<NPCStateUpdateBase>, z.ZodType<NPCStateUpdateBase>, ...z.ZodType<NPCStateUpdateBase>[]],
  )
}

export const NPCStateUpdateSchema = buildNPCStateUpdateSchema(z.string().min(1).describe(desc("llm.npc_update.name")))

export const NPCCreationSchema = buildNpcCreationSchema({
  useNpcAppearance: true,
  useNpcPersonalityTraits: true,
  useNpcMajorFlaws: true,
  useNpcQuirks: true,
  useNpcPerks: true,
  useNpcLocation: true,
  useNpcActivity: true,
})

export const SetCurrentAppearanceSection = z.string().min(1).describe(desc("llm.turn_response.set_current_appearance"))

export const CurrentClothingSection = z.string().min(1).describe(desc("state.appearance.current_clothing"))

export const SetCurrentInventorySection = z
  .array(InventoryItemSchema)
  .describe(desc("llm.turn_response.set_current_inventory"))

export const buildNPCChangesSection = (nameSchema: z.ZodType<string>, flags?: NPCUpdateFlags) => {
  const updateSchema = buildNPCStateUpdateSchema(nameSchema, flags)
  return z.array(updateSchema).describe(desc("llm.turn_response.npc_changes"))
}
export const NPCChangesSection = buildNPCChangesSection(z.string().min(1).describe(desc("llm.npc_update.name")))

export const NPCIntroductionsSection = z.array(NPCCreationSchema).describe(desc("llm.turn_response.npc_introductions"))

export const TurnResponseSchema = z
  .object({
    narrative_text: z.string().min(1).describe(desc("llm.turn_response.narrative_text")),
    world_state_update: WorldStateUpdateSchema.describe(desc("llm.turn_response.world_state_update")),
    set_current_appearance: SetCurrentAppearanceSection.optional(),
    current_clothing: CurrentClothingSection.optional(),
    set_current_inventory: SetCurrentInventorySection.optional(),
    npc_changes: NPCChangesSection.optional(),
    npc_introductions: NPCIntroductionsSection.optional(),
  })
  .strict()
