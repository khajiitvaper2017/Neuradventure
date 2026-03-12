import { z } from "zod"
import { CharacterAppearanceSchema } from "./game-state.js"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { desc } from "./field-descriptions.js"

export type NpcCreationFlags = {
  useNpcAppearance: boolean
  useNpcPersonalityTraits: boolean
  useNpcMajorFlaws: boolean
  useNpcQuirks: boolean
  useNpcPerks: boolean
  useNpcLocation: boolean
  useNpcActivity: boolean
}

const MajorFlawSchema = z.string().min(1).describe(desc("traits.major_flaw"))
const QuirkSchema = z.string().min(1).describe(desc("traits.quirk"))
const PerkSchema = z.string().min(1).describe(desc("traits.perk"))
const MajorFlawsSchema = z.array(MajorFlawSchema).max(3).describe(desc("traits.major_flaws"))
const QuirksSchema = z.array(QuirkSchema).max(6).describe(desc("traits.quirks"))
const PerksSchema = z.array(PerkSchema).max(6).describe(desc("traits.perks"))

export function buildNpcCreationSchema(flags: NpcCreationFlags) {
  const shape: Record<string, z.ZodTypeAny> = {
    name: z.string().min(1).describe(desc("state.character.name")),
    race: z.string().min(1).describe(desc("state.character.race")),
    gender: z.string().min(1).describe(desc("state.character.gender")),
  }

  if (flags.useNpcAppearance) {
    shape.appearance = CharacterAppearanceSchema.describe(desc("state.character.appearance"))
  } else {
    shape.general_description = z.string().min(1).describe(desc("state.character.general_description"))
  }

  if (flags.useNpcPersonalityTraits) {
    shape.personality_traits = PersonalityTraitsSchema.describe(desc("traits.personality_traits"))
  }
  if (flags.useNpcMajorFlaws) {
    shape.major_flaws = MajorFlawsSchema.describe(desc("traits.major_flaws"))
  }
  if (flags.useNpcQuirks) {
    shape.quirks = QuirksSchema.describe(desc("traits.quirks"))
  }
  if (flags.useNpcPerks) {
    shape.perks = PerksSchema.describe(desc("traits.perks"))
  }
  if (flags.useNpcLocation) {
    shape.current_location = z.string().min(1).describe(desc("state.character.current_location"))
  }
  if (flags.useNpcActivity) {
    shape.current_activity = z.string().min(1).describe(desc("state.character.current_activity"))
  }

  return z.object(shape).strict()
}
