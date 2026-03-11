import { z } from "zod"
import { NPCStateSchema } from "./game-state.js"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "./constants.js"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { desc } from "./field-descriptions.js"

const MajorFlawSchema = z.string().min(1).describe(desc("traits.major_flaw"))
const QuirkSchema = z.string().min(1).describe(desc("traits.quirk"))
const PerkSchema = z.string().min(1).describe(desc("traits.perk"))
const MajorFlawsStrictSchema = z.array(MajorFlawSchema).max(3).describe(desc("traits.major_flaws"))
const QuirksStrictSchema = z.array(QuirkSchema).describe(desc("traits.quirks"))
const PerksStrictSchema = z.array(PerkSchema).max(5).describe(desc("traits.perks"))

export const GenerateCharacterResponseSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.character.name")),
    race: z.string().min(1).describe(desc("state.character.race")),
    gender: z.string().min(1).describe(desc("state.character.gender")),
    baseline_appearance: z.string().min(1).describe(desc("state.appearance.baseline_appearance")),
    current_clothing: z.string().min(1).describe(desc("state.appearance.current_clothing")),
    personality_traits: PersonalityTraitsSchema.describe(desc("traits.personality_traits")),
    major_flaws: MajorFlawsStrictSchema.describe(desc("traits.major_flaws")),
    quirks: QuirksStrictSchema.describe(desc("traits.quirks")),
    perks: PerksStrictSchema.describe(desc("traits.perks")),
  })
  .strict()

export const GenerateCharacterAppearanceResponseSchema = z
  .object({
    baseline_appearance: z.string().min(1).describe(desc("state.appearance.baseline_appearance")),
    current_appearance: z.string().min(1).describe(desc("state.appearance.current_appearance")),
  })
  .strict()

export const GenerateCharacterClothingResponseSchema = z
  .object({
    current_clothing: z.string().min(1).describe(desc("state.appearance.current_clothing")),
  })
  .strict()

export const GenerateCharacterTraitsResponseSchema = z
  .object({
    personality_traits: PersonalityTraitsSchema.describe(desc("traits.personality_traits")),
    major_flaws: MajorFlawsStrictSchema.describe(desc("traits.major_flaws")),
    quirks: QuirksStrictSchema.describe(desc("traits.quirks")),
    perks: PerksStrictSchema.describe(desc("traits.perks")),
  })
  .strict()

export const GenerateStoryResponseSchema = z
  .object({
    title: z.string().min(1).describe(desc("generation.story.title")),
    opening_scenario: z.string().min(1).describe(desc("generation.story.opening_scenario")),
    starting_location: z.string().min(1).describe(desc("generation.story.starting_location")),
    starting_date: z
      .string()
      .regex(DATE_REGEX, "starting_date must be YYYY-MM-DD")
      .describe(desc("generation.story.starting_date")),
    starting_time: z
      .string()
      .regex(TIME_OF_DAY_REGEX, "starting_time must be 24h HH:MM")
      .describe(desc("generation.story.starting_time")),
    character_baseline_description: z.string().min(1).describe(desc("state.character.baseline_description")),
    character_current_appearance: z.string().min(1).describe(desc("state.appearance.current_appearance")),
    character_current_activity: z.string().min(1).describe(desc("state.character.current_activity")),
    pregen_npcs: z.array(NPCStateSchema).describe(desc("generation.story.pregen_npcs")),
  })
  .strict()
