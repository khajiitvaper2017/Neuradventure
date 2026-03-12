import { z } from "zod"
import { PersonalityTraitsSchema } from "./personality-traits.js"

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
  const shape: Record<string, z.ZodTypeAny> = {
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
  }

  if (flags.useNpcPersonalityTraits) {
    shape.personality_traits = PersonalityTraitsSchema
  }
  if (flags.useNpcMajorFlaws) {
    shape.major_flaws = MajorFlawsSchema
  }
  if (flags.useNpcQuirks) {
    shape.quirks = QuirksSchema
  }
  if (flags.useNpcPerks) {
    shape.perks = PerksSchema
  }
  if (flags.useNpcLocation) {
    shape.current_location = z.string().min(1)
  }
  if (flags.useNpcActivity) {
    shape.current_activity = z.string().min(1)
  }
  if (flags.useNpcAppearance) {
    shape.baseline_appearance = z.string().min(1)
    shape.current_clothing = z.string().min(1)
    shape.current_appearance = z.string().min(1)
  } else {
    shape.general_description = z.string().min(1)
  }
  return z.object(shape).strict()
}
