import { z } from "zod"
import { MajorFlawsSchema, PerksSchema } from "@/domain/story/schemas/game-state"
import { PersonalityTraitsSchema } from "@/domain/story/schemas/personality-traits"
import { getFieldDescription } from "@/llm/contract/descriptions"

export const GenerateCharacterAppearanceResponseSchema = z
  .object({
    baseline_appearance: z.string().min(1).describe(getFieldDescription("state.character.baseline_appearance")),
  })
  .strict()

export const GenerateCharacterClothingResponseSchema = z
  .object({
    current_clothing: z.string().min(1).describe(getFieldDescription("state.character.current_clothing")),
  })
  .strict()

export const GenerateCharacterTraitsResponseSchema = z
  .object({
    personality_traits: PersonalityTraitsSchema.describe(getFieldDescription("traits.personality_traits")),
    major_flaws: MajorFlawsSchema.describe(getFieldDescription("traits.major_flaws")),
    perks: PerksSchema.describe(getFieldDescription("traits.perks")),
  })
  .strict()

export const GenerateChatResponseSchema = z
  .object({
    title: z.string().min(1),
    greeting: z.string().min(1),
  })
  .strict()
