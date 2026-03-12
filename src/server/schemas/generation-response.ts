import { z } from "zod"
import { NPCStateStoredSchema } from "./game-state.js"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "./constants.js"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { desc } from "./field-descriptions.js"
import { resolveModuleFlags, type StoryModules } from "./story-modules.js"
import type { GenerateCharacterResponse, GenerateStoryResponse } from "../core/models.js"
import { buildNpcCreationSchema } from "./npc-creation.js"

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
    general_description: z.string().min(1).optional().describe(desc("state.character.general_description")),
    baseline_appearance: z.string().min(1).optional().describe(desc("state.appearance.baseline_appearance")),
    current_clothing: z.string().min(1).optional().describe(desc("state.appearance.current_clothing")),
    personality_traits: PersonalityTraitsSchema.optional().describe(desc("traits.personality_traits")),
    major_flaws: MajorFlawsStrictSchema.optional().describe(desc("traits.major_flaws")),
    quirks: QuirksStrictSchema.optional().describe(desc("traits.quirks")),
    perks: PerksStrictSchema.optional().describe(desc("traits.perks")),
  })
  .strict()

export function buildGenerateCharacterResponseSchema(modules: StoryModules): z.ZodType<GenerateCharacterResponse> {
  const flags = resolveModuleFlags(modules)
  const shape: Record<string, z.ZodTypeAny> = {
    name: z.string().min(1).describe(desc("state.character.name")),
    race: z.string().min(1).describe(desc("state.character.race")),
    gender: z.string().min(1).describe(desc("state.character.gender")),
  }

  if (modules.character_detail_mode === "general") {
    shape.general_description = z.string().min(1).describe(desc("state.character.general_description"))
  } else {
    shape.baseline_appearance = z.string().min(1).describe(desc("state.appearance.baseline_appearance"))
    shape.current_clothing = z.string().min(1).describe(desc("state.appearance.current_clothing"))
  }

  if (flags.useCharPersonalityTraits) {
    shape.personality_traits = PersonalityTraitsSchema.describe(desc("traits.personality_traits"))
  }
  if (flags.useCharMajorFlaws) {
    shape.major_flaws = MajorFlawsStrictSchema.describe(desc("traits.major_flaws"))
  }
  if (flags.useCharQuirks) {
    shape.quirks = QuirksStrictSchema.describe(desc("traits.quirks"))
  }
  if (flags.useCharPerks) {
    shape.perks = PerksStrictSchema.describe(desc("traits.perks"))
  }

  return z.object(shape).strict() as unknown as z.ZodType<GenerateCharacterResponse>
}

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
    current_appearance: z.string().min(1).optional().describe(desc("state.appearance.current_appearance")),
    character_general_description: z
      .string()
      .min(1)
      .optional()
      .describe(desc("generation.story.character_general_description")),
    pregen_npcs: z.array(NPCStateStoredSchema).optional().describe(desc("generation.story.pregen_npcs")),
  })
  .strict()

export function buildGenerateStoryResponseSchema(modules: StoryModules): z.ZodType<GenerateStoryResponse> {
  const flags = resolveModuleFlags(modules)
  const npcSchema = buildNpcCreationSchema({
    useNpcAppearance: flags.useNpcAppearance,
    useNpcPersonalityTraits: flags.useNpcPersonalityTraits,
    useNpcMajorFlaws: flags.useNpcMajorFlaws,
    useNpcQuirks: flags.useNpcQuirks,
    useNpcPerks: flags.useNpcPerks,
    useNpcLocation: flags.useNpcLocation,
    useNpcActivity: flags.useNpcActivity,
  })

  const baseShape: Record<string, z.ZodTypeAny> = {
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
  }

  if (modules.character_detail_mode === "general") {
    baseShape.character_general_description = z
      .string()
      .min(1)
      .describe(desc("generation.story.character_general_description"))
  } else {
    baseShape.current_appearance = z.string().min(1).describe(desc("state.appearance.current_appearance"))
  }

  let schema: z.AnyZodObject = z.object(baseShape).strict()

  if (modules.track_npcs) {
    schema = schema.extend({
      pregen_npcs: z.array(npcSchema).describe(desc("generation.story.pregen_npcs")),
    })
  } else {
    schema = schema.extend({
      pregen_npcs: z.array(npcSchema).max(0).optional(),
    })
  }

  return schema.transform((value: { [key: string]: unknown; pregen_npcs?: unknown[] }) => ({
    ...value,
    pregen_npcs: (value.pregen_npcs ?? []).map((npc: unknown) => NPCStateStoredSchema.parse(npc)),
  })) as unknown as z.ZodType<GenerateStoryResponse>
}

export const GenerateChatResponseSchema = z
  .object({
    title: z.string().min(1).describe(desc("generation.chat.title")),
    scenario: z.string().min(1).describe(desc("generation.chat.scenario")),
  })
  .strict()
