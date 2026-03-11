import { z } from "zod"
import { NPCStateUpdateBaseSchema } from "./npc-state-update-base.js"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { InventoryItemSchema, WorldStateSchema } from "./game-state.js"
import { ONE_OR_TWO_PARAGRAPHS_REGEX } from "./constants.js"

export const buildNPCStateUpdateSchema = (nameSchema: z.ZodType<string>): z.ZodType<unknown> => {
  const base = NPCStateUpdateBaseSchema.extend({ name: nameSchema })
  const withRace = base.extend({ race: z.string().min(1) })
  const withGender = base.extend({ gender: z.string().min(1) })
  const withLocation = base.extend({ set_location: z.string().min(1) })
  const withAppearance = base.extend({ set_appearance: z.string().min(1) })
  const withClothing = base.extend({ set_clothing: z.string().min(1) })
  const withRelationship = base.extend({ set_relationship: z.string().min(1) })
  const withNotes = base.extend({ set_notes: z.string().min(1) })
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

export const NPCStateUpdateSchema = buildNPCStateUpdateSchema(z.string().min(1))

export const NPCCreationSchema = z
  .object({
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    personality_traits: PersonalityTraitsSchema,
    set_location: z.string().min(1),
    set_appearance: z.string().min(1),
    set_clothing: z.string().min(1),
    set_relationship: z.string().min(1),
    set_notes: z.string().min(1),
  })
  .strict()

export const AppearanceChangeSection = z.string().min(1)

export const ClothingChangeSection = z.string().min(1)

export const InventoryChangeSection = z.array(InventoryItemSchema)

export const buildNPCChangesSection = (nameSchema: z.ZodType<string>) => {
  const updateSchema = buildNPCStateUpdateSchema(nameSchema)
  return z.array(updateSchema)
}
export const NPCChangesSection = buildNPCChangesSection(z.string().min(1))

export const NPCIntroductionsSection = z.array(NPCCreationSchema)

export const TurnResponseSchema = z
  .object({
    narrative_text: z
      .string()
      .min(1)
      .regex(ONE_OR_TWO_PARAGRAPHS_REGEX, "narrative_text must be 1-2 paragraphs separated by \\n\\n"),
    world_state_update: WorldStateSchema,
    appearance_change: AppearanceChangeSection,
    clothing_change: ClothingChangeSection,
    inventory_change: InventoryChangeSection,
    npc_changes: NPCChangesSection,
    npc_introductions: NPCIntroductionsSection,
  })
  .strict()
