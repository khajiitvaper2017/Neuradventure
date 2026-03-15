import { z } from "zod"
import { PersonalityTraitsSchema } from "@/engine/schemas/personality-traits"

export type NpcCreationFlags = {
  useNpcAppearance: boolean
  useNpcPersonalityTraits: boolean
  useNpcMajorFlaws: boolean
  useNpcQuirks: boolean
  useNpcPerks: boolean
  useNpcLocation: boolean
  useNpcActivity: boolean
}

const MajorFlawSchema = z.string().min(1)
const QuirkSchema = z.string().min(1)
const PerkSchema = z.string().min(1)
const MajorFlawsSchema = z.array(MajorFlawSchema).max(3)
const QuirksSchema = z.array(QuirkSchema).max(6)
const PerksSchema = z.array(PerkSchema).max(6)

export function buildNpcCreationSchema(flags: NpcCreationFlags) {
  const shape = {
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    general_description: z.string().min(1),
    ...(flags.useNpcPersonalityTraits ? { personality_traits: PersonalityTraitsSchema } : {}),
    ...(flags.useNpcMajorFlaws ? { major_flaws: MajorFlawsSchema } : {}),
    ...(flags.useNpcQuirks ? { quirks: QuirksSchema } : {}),
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
  }

  return z.object(shape).strict()
}
