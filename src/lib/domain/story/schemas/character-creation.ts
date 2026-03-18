import { z } from "zod"
import { PersonalityTraitsSchema } from "@/domain/story/schemas/personality-traits"
import { InventoryItemSchema } from "@/domain/story/schemas/game-state"

export type CharacterCreationFlags = {
  useAppearance: boolean
  usePersonalityTraits: boolean
  useMajorFlaws: boolean
  usePerks: boolean
  useLocation: boolean
  useActivity: boolean
  useInventory: boolean
}

const MajorFlawSchema = z.string().min(1)
const PerkSchema = z.string().min(1)
const MajorFlawsSchema = z.array(MajorFlawSchema)
const PerksSchema = z.array(PerkSchema)

export function buildCharacterCreationSchema(flags: CharacterCreationFlags, customFieldsSchema?: z.ZodTypeAny) {
  const shape = {
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    general_description: z.string().min(1),
    ...(flags.usePersonalityTraits ? { personality_traits: PersonalityTraitsSchema } : {}),
    ...(flags.useMajorFlaws ? { major_flaws: MajorFlawsSchema } : {}),
    ...(flags.usePerks ? { perks: PerksSchema } : {}),
    ...(flags.useLocation ? { current_location: z.string().min(1) } : {}),
    ...(flags.useActivity ? { current_activity: z.string().min(1) } : {}),
    ...(flags.useInventory ? { inventory: z.array(InventoryItemSchema) } : {}),
    ...(flags.useAppearance
      ? {
          baseline_appearance: z.string().min(1),
          current_clothing: z.string().min(1),
          current_appearance: z.string().min(1),
        }
      : {}),
    ...(customFieldsSchema ? { custom_fields: customFieldsSchema.optional() } : {}),
  }

  return z.object(shape).strict()
}
