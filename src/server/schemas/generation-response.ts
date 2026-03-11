import { z } from "zod"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { NPCStateSchema } from "./game-state.js"
import { THREE_TO_TWELVE_WORDS_REGEX } from "./constants.js"

const CustomTraitSchema = z.string().regex(THREE_TO_TWELVE_WORDS_REGEX, "custom_traits items must be 3-12 words")
const CustomTraitsStrictSchema = z.array(CustomTraitSchema)

export const GenerateCharacterResponseSchema = z
  .object({
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    physical_description: z.string().min(1),
    current_clothing: z.string().min(1),
    personality_traits: PersonalityTraitsSchema,
    custom_traits: CustomTraitsStrictSchema,
  })
  .strict()

export const GenerateCharacterAppearanceResponseSchema = z
  .object({
    physical_description: z.string().min(1),
  })
  .strict()

export const GenerateCharacterClothingResponseSchema = z
  .object({
    current_clothing: z.string().min(1),
  })
  .strict()

export const GenerateCharacterTraitsResponseSchema = z
  .object({
    personality_traits: PersonalityTraitsSchema,
    custom_traits: CustomTraitsStrictSchema,
  })
  .strict()

export const GenerateStoryResponseSchema = z
  .object({
    title: z.string().min(1),
    opening_scenario: z.string().min(1),
    starting_location: z.string().min(1),
    pregen_npcs: z.array(NPCStateSchema),
  })
  .strict()
