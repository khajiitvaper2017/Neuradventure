import { z } from "zod"
import { PersonalityTraitsSchema } from "@/domain/story/schemas/personality-traits"

export type NpcCreationFlags = {
  useNpcAppearance: boolean
  useNpcPersonalityTraits: boolean
  useNpcMajorFlaws: boolean
  useNpcPerks: boolean
  useNpcLocation: boolean
  useNpcActivity: boolean
}

const MajorFlawSchema = z.string().min(1)
const PerkSchema = z.string().min(1)
const MajorFlawsSchema = z.array(MajorFlawSchema)
const PerksSchema = z.array(PerkSchema)

export function buildNpcCreationSchema(flags: NpcCreationFlags, characterCustomFieldsSchema?: z.ZodTypeAny) {
  const shape = {
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    general_description: z.string().min(1),
    ...(flags.useNpcPersonalityTraits ? { personality_traits: PersonalityTraitsSchema } : {}),
    ...(flags.useNpcMajorFlaws ? { major_flaws: MajorFlawsSchema } : {}),
    ...(flags.useNpcPerks ? { perks: PerksSchema } : {}),
    ...(flags.useNpcLocation ? { current_location: z.string().min(1) } : {}),
    ...(flags.useNpcActivity ? { current_activity: z.string().min(1) } : {}),
    ...(flags.useNpcAppearance
      ? {
          baseline_appearance: z.string().min(1),
          current_clothing: z.string().min(1),
          current_appearance: z.string().min(1),
        }
      : {}),
    ...(characterCustomFieldsSchema ? { custom_fields: characterCustomFieldsSchema.optional() } : {}),
  }

  return z.object(shape).strict()
}
