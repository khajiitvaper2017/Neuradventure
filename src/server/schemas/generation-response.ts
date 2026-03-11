import { z } from "zod"
import { NPCStateSchema, RelationshipScoresSchema } from "./game-state.js"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { desc } from "./field-descriptions.js"

const QuirkSchema = z.string().min(1)
const PerkSchema = z.string().min(1)
const QuirksStrictSchema = z.array(QuirkSchema).describe(desc("traits.quirks"))
const PerksStrictSchema = z.array(PerkSchema).describe(desc("traits.perks"))

export const GenerateCharacterResponseSchema = z
  .object({
    name: z.string().min(1).describe(desc("generation.character.name")),
    race: z.string().min(1).describe(desc("generation.character.race")),
    gender: z.string().min(1).describe(desc("generation.character.gender")),
    baseline_appearance: z.string().min(1).describe(desc("generation.character.baseline_appearance")),
    current_clothing: z.string().min(1).describe(desc("generation.character.current_clothing")),
    personality_traits: PersonalityTraitsSchema.describe(desc("generation.character.personality_traits")),
    quirks: QuirksStrictSchema.describe(desc("generation.character.quirks")),
    perks: PerksStrictSchema.describe(desc("generation.character.perks")),
    relationship_scores: RelationshipScoresSchema.describe(desc("generation.character.relationship_scores")),
  })
  .strict()

export const GenerateCharacterAppearanceResponseSchema = z
  .object({
    baseline_appearance: z.string().min(1).describe(desc("generation.character_appearance.baseline_appearance")),
    current_appearance: z.string().min(1).describe(desc("generation.character_appearance.current_appearance")),
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
    quirks: QuirksStrictSchema.describe(desc("generation.character_traits.quirks")),
    perks: PerksStrictSchema.describe(desc("generation.character_traits.perks")),
  })
  .strict()

export const GenerateStoryResponseSchema = z
  .object({
    title: z.string().min(1).describe(desc("generation.story.title")),
    opening_scenario: z.string().min(1).describe(desc("generation.story.opening_scenario")),
    starting_location: z.string().min(1).describe(desc("generation.story.starting_location")),
    character_baseline_description: z.string().min(1).describe(desc("generation.story.character_baseline_description")),
    character_current_appearance: z.string().min(1).describe(desc("generation.story.character_current_appearance")),
    character_current_activity: z.string().min(1).describe(desc("generation.story.character_current_activity")),
    pregen_npcs: z.array(NPCStateSchema).describe(desc("generation.story.pregen_npcs")),
  })
  .strict()
