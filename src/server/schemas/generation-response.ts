import { z } from "zod"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { NPCStateSchema } from "./game-state.js"
import { desc } from "./field-descriptions.js"

const CustomTraitSchema = z.string().min(1)
const CustomTraitsStrictSchema = z.array(CustomTraitSchema).describe(desc("traits.custom_traits"))

export const GenerateCharacterResponseSchema = z
  .object({
    name: z.string().min(1).describe(desc("generation.character.name")),
    race: z.string().min(1).describe(desc("generation.character.race")),
    gender: z.string().min(1).describe(desc("generation.character.gender")),
    physical_description: z.string().min(1).describe(desc("generation.character.physical_description")),
    current_clothing: z.string().min(1).describe(desc("generation.character.current_clothing")),
    personality_traits: PersonalityTraitsSchema.describe(desc("generation.character.personality_traits")),
    custom_traits: CustomTraitsStrictSchema.describe(desc("generation.character.custom_traits")),
  })
  .strict()

export const GenerateCharacterAppearanceResponseSchema = z
  .object({
    physical_description: z.string().min(1).describe(desc("generation.character_appearance.physical_description")),
  })
  .strict()

export const GenerateCharacterClothingResponseSchema = z
  .object({
    current_clothing: z.string().min(1).describe(desc("generation.character_clothing.current_clothing")),
  })
  .strict()

export const GenerateCharacterTraitsResponseSchema = z
  .object({
    personality_traits: PersonalityTraitsSchema.describe(desc("generation.character_traits.personality_traits")),
    custom_traits: CustomTraitsStrictSchema.describe(desc("generation.character_traits.custom_traits")),
  })
  .strict()

export const GenerateStoryResponseSchema = z
  .object({
    title: z.string().min(1).describe(desc("generation.story.title")),
    opening_scenario: z.string().min(1).describe(desc("generation.story.opening_scenario")),
    starting_location: z.string().min(1).describe(desc("generation.story.starting_location")),
    pregen_npcs: z.array(NPCStateSchema).describe(desc("generation.story.pregen_npcs")),
  })
  .strict()
