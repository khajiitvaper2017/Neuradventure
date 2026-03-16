import { z } from "zod"
import { NPCStateStoredSchema } from "@/engine/schemas/game-state"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "@/engine/schemas/constants"
import { PersonalityTraitsSchema } from "@/engine/schemas/personality-traits"
import { resolveModuleFlags, type StoryModules } from "@/engine/schemas/story-modules"
import type { GenerateCharacterResponse, GenerateStoryResponse } from "@/shared/api-types"
import { buildNpcCreationSchema } from "@/engine/schemas/npc-creation"
import * as db from "@/engine/core/db"
import { buildCharacterCustomFieldsUpdateSchema } from "@/engine/schemas/custom-fields"

const MajorFlawSchema = z.string().min(1)
const PerkSchema = z.string().min(1)
const MajorFlawsStrictSchema = z.array(MajorFlawSchema)
const PerksStrictSchema = z.array(PerkSchema)

export const GenerateCharacterResponseSchema = z
  .object({
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    general_description: z.string().min(1),
    personality_traits: PersonalityTraitsSchema.optional(),
    baseline_appearance: z.string().min(1).optional(),
    current_clothing: z.string().min(1).optional(),
    major_flaws: MajorFlawsStrictSchema.optional(),
    perks: PerksStrictSchema.optional(),
  })
  .strict()

export function buildGenerateCharacterResponseSchema(modules: StoryModules): z.ZodType<GenerateCharacterResponse> {
  const flags = resolveModuleFlags(modules)
  const shape = {
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    general_description: z.string().min(1),
    ...(flags.useCharAppearance
      ? {
          baseline_appearance: z.string().min(1),
          current_clothing: z.string().min(1),
        }
      : {}),
    ...(flags.useCharPersonalityTraits ? { personality_traits: PersonalityTraitsSchema } : {}),
    ...(flags.useCharMajorFlaws ? { major_flaws: MajorFlawsStrictSchema } : {}),
    ...(flags.useCharPerks ? { perks: PerksStrictSchema } : {}),
  }

  return z.object(shape).strict() as unknown as z.ZodType<GenerateCharacterResponse>
}

export const GenerateCharacterAppearanceResponseSchema = z
  .object({
    baseline_appearance: z.string().min(1),
    current_appearance: z.string().min(1),
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
    major_flaws: MajorFlawsStrictSchema,
    perks: PerksStrictSchema,
  })
  .strict()

export const StoryResponseSchema = z
  .object({
    title: z.string().min(1),
    opening_scenario: z.string().min(1),
    starting_location: z.string().min(1),
    starting_date: z.string().regex(DATE_REGEX, "starting_date must be YYYY-MM-DD"),
    starting_time: z.string().regex(TIME_OF_DAY_REGEX, "starting_time must be 24h HH:MM"),
    current_appearance: z.string().min(1).optional(),
    general_description: z.string().trim().min(1),
    pregen_npcs: z.array(NPCStateStoredSchema).optional(),
  })
  .strict()

export function buildStoryResponseSchema(modules: StoryModules): z.ZodType<GenerateStoryResponse> {
  const flags = resolveModuleFlags(modules)
  const customDefs = db.listCustomFields()
  const npcCustomFields = buildCharacterCustomFieldsUpdateSchema(customDefs)
  const npcSchema = buildNpcCreationSchema(
    {
      useNpcActivity: flags.useNpcActivity,
      useNpcLocation: flags.useNpcLocation,
      useNpcPersonalityTraits: flags.useNpcPersonalityTraits,
      useNpcAppearance: flags.useNpcAppearance,
      useNpcMajorFlaws: flags.useNpcMajorFlaws,
      useNpcPerks: flags.useNpcPerks,
    },
    npcCustomFields,
  )

  const baseShape = {
    title: z.string().min(1),
    opening_scenario: z.string().min(1),
    starting_location: z.string().min(1),
    starting_date: z.string().regex(DATE_REGEX, "starting_date must be YYYY-MM-DD"),
    starting_time: z.string().regex(TIME_OF_DAY_REGEX, "starting_time must be 24h HH:MM"),
    general_description: z.string().trim().min(1),
    ...(flags.useCharAppearance ? { current_appearance: z.string().min(1) } : {}),
  }

  let schema = z.object(baseShape).strict()

  if (modules.track_npcs) {
    schema = schema.extend({
      pregen_npcs: z.array(npcSchema),
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
    title: z.string().min(1),
    greeting: z.string().min(1),
  })
  .strict()
