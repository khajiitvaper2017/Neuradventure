import { z } from "zod"
import { NPCStateUpdateBaseSchema } from "./npc-state-update-base.js"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { InventoryItemSchema, WorldStateSchema } from "./game-state.js"
import { desc } from "./field-descriptions.js"

type NPCStateUpdateBase = z.infer<typeof NPCStateUpdateBaseSchema>

export const buildNPCStateUpdateSchema = (nameSchema: z.ZodType<string>): z.ZodType<NPCStateUpdateBase> => {
  const base = NPCStateUpdateBaseSchema.extend({ name: nameSchema })
  const withRace = base.extend({ race: z.string().min(1).describe(desc("llm.npc_update.race")) })
  const withGender = base.extend({ gender: z.string().min(1).describe(desc("llm.npc_update.gender")) })
  const withLocation = base.extend({ set_location: z.string().min(1).describe(desc("llm.npc_update.set_location")) })
  const withAppearance = base.extend({ set_appearance: z.string().min(1).describe(desc("llm.npc_update.set_appearance")) })
  const withClothing = base.extend({ set_clothing: z.string().min(1).describe(desc("llm.npc_update.set_clothing")) })
  const withRelationship = base.extend({
    set_relationship: z.string().min(1).describe(desc("llm.npc_update.set_relationship")),
  })
  const withNotes = base.extend({ set_notes: z.string().min(1).describe(desc("llm.npc_update.set_notes")) })
  return z.union([
    withRace,
    withGender,
    withLocation,
    withAppearance,
    withClothing,
    withRelationship,
    withNotes,
  ])
}

export const NPCStateUpdateSchema = buildNPCStateUpdateSchema(
  z.string().min(1).describe(desc("llm.npc_update.name")),
)

export const NPCCreationSchema = z
  .object({
    name: z.string().min(1).describe(desc("llm.npc_creation.name")),
    race: z.string().min(1).describe(desc("llm.npc_creation.race")),
    gender: z.string().min(1).describe(desc("llm.npc_creation.gender")),
    personality_traits: PersonalityTraitsSchema.describe(desc("llm.npc_creation.personality_traits")),
    set_location: z.string().min(1).describe(desc("llm.npc_creation.set_location")),
    set_appearance: z.string().min(1).describe(desc("llm.npc_creation.set_appearance")),
    set_clothing: z.string().min(1).describe(desc("llm.npc_creation.set_clothing")),
    set_relationship: z.string().min(1).describe(desc("llm.npc_creation.set_relationship")),
    set_notes: z.string().min(1).describe(desc("llm.npc_creation.set_notes")),
  })
  .strict()

export const AppearanceChangeSection = z.string().min(1).describe(desc("llm.turn_response.appearance_change"))

export const ClothingChangeSection = z.string().min(1).describe(desc("llm.turn_response.clothing_change"))

export const InventoryChangeSection = z
  .array(InventoryItemSchema)
  .describe(desc("llm.turn_response.inventory_change"))

export const buildNPCChangesSection = (nameSchema: z.ZodType<string>) => {
  const updateSchema = buildNPCStateUpdateSchema(nameSchema)
  return z.array(updateSchema).describe(desc("llm.turn_response.npc_changes"))
}
export const NPCChangesSection = buildNPCChangesSection(z.string().min(1).describe(desc("llm.npc_update.name")))

export const NPCIntroductionsSection = z
  .array(NPCCreationSchema)
  .describe(desc("llm.turn_response.npc_introductions"))

export const TurnResponseSchema = z
  .object({
    narrative_text: z
      .string()
      .min(1)
      .describe(desc("llm.turn_response.narrative_text")),
    world_state_update: WorldStateSchema.describe(desc("llm.turn_response.world_state_update")),
    appearance_change: AppearanceChangeSection.optional(),
    clothing_change: ClothingChangeSection.optional(),
    inventory_change: InventoryChangeSection.optional(),
    npc_changes: NPCChangesSection.optional(),
    npc_introductions: NPCIntroductionsSection.optional(),
  })
  .strict()
