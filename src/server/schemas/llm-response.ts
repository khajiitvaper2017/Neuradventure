import { z } from "zod"
import { NPCStateUpdateBaseSchema } from "./npc-state-update-base.js"
import { InventoryItemSchema, WorldStateUpdateSchema, NPCStateSchema } from "./game-state.js"
import { desc } from "./field-descriptions.js"

type NPCStateUpdateBase = z.infer<typeof NPCStateUpdateBaseSchema>

export const buildNPCStateUpdateSchema = (nameSchema: z.ZodType<string>): z.ZodType<NPCStateUpdateBase> => {
  const base = NPCStateUpdateBaseSchema.extend({ name: nameSchema })
  const withRace = base.extend({ race: z.string().min(1).describe(desc("llm.npc_update.race")) })
  const withGender = base.extend({ gender: z.string().min(1).describe(desc("llm.npc_update.gender")) })
  const withLocation = base.extend({
    set_current_location: z.string().min(1).describe(desc("llm.npc_update.set_current_location")),
  })
  const withAppearance = base.extend({
    set_current_appearance: z.string().min(1).describe(desc("llm.npc_update.set_current_appearance")),
  })
  const withClothing = base.extend({
    set_current_clothing: z.string().min(1).describe(desc("state.appearance.current_clothing")),
  })
  const withActivity = base.extend({
    set_current_activity: z.string().min(1).describe(desc("llm.npc_update.set_current_activity")),
  })
  return z.union([withRace, withGender, withLocation, withAppearance, withClothing, withActivity])
}

export const NPCStateUpdateSchema = buildNPCStateUpdateSchema(z.string().min(1).describe(desc("llm.npc_update.name")))

export const NPCCreationSchema = NPCStateSchema

export const AppearanceChangeSection = z.string().min(1).describe(desc("llm.turn_response.appearance_change"))

export const ClothingChangeSection = z.string().min(1).describe(desc("state.appearance.current_clothing"))

export const InventoryChangeSection = z.array(InventoryItemSchema).describe(desc("llm.turn_response.inventory_change"))

export const buildNPCChangesSection = (nameSchema: z.ZodType<string>) => {
  const updateSchema = buildNPCStateUpdateSchema(nameSchema)
  return z.array(updateSchema).describe(desc("llm.turn_response.npc_changes"))
}
export const NPCChangesSection = buildNPCChangesSection(z.string().min(1).describe(desc("llm.npc_update.name")))

export const NPCIntroductionsSection = z.array(NPCCreationSchema).describe(desc("llm.turn_response.npc_introductions"))

export const TurnResponseSchema = z
  .object({
    narrative_text: z.string().min(1).describe(desc("llm.turn_response.narrative_text")),
    world_state_update: WorldStateUpdateSchema.describe(desc("llm.turn_response.world_state_update")),
    appearance_change: AppearanceChangeSection.optional(),
    clothing_change: ClothingChangeSection.optional(),
    inventory_change: InventoryChangeSection.optional(),
    npc_changes: NPCChangesSection.optional(),
    npc_introductions: NPCIntroductionsSection.optional(),
  })
  .strict()
