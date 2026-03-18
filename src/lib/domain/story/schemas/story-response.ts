import { z } from "zod"
import { NPCStateStoredSchema } from "@/domain/story/schemas/game-state"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "@/domain/story/schemas/constants"
import { PersonalityTraitsSchema } from "@/domain/story/schemas/personality-traits"
import { resolveModuleFlags, type StoryModules } from "@/domain/story/schemas/story-modules"
import type { GenerateCharacterResponse, GenerateStoryResponse } from "@/types/api"
import { buildCharacterCreationSchema } from "@/domain/story/schemas/character-creation"
import * as db from "@/db/core"
import {
  buildCharacterCustomFieldShape,
  buildCharacterCustomFieldsUpdateSchema,
} from "@/domain/story/schemas/custom-fields"
import { isCustomFieldModuleEnabled } from "@/domain/story/custom-field-modules"
import { buildCharacterUpdateSchema } from "@/domain/story/schemas/llm-response"

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
    major_flaws: MajorFlawsStrictSchema.optional(),
    perks: PerksStrictSchema.optional(),
  })
  .strict()

export function buildGenerateCharacterResponseSchema(modules: StoryModules): z.ZodType<GenerateCharacterResponse> {
  const flags = resolveModuleFlags(modules)
  const enabledBaseCustomDefs = db
    .listCustomFields()
    .filter(
      (d) =>
        d.enabled &&
        d.scope === "character" &&
        d.placement === "base" &&
        isCustomFieldModuleEnabled(modules, d.id, "character"),
    )
  const characterCustomFields =
    enabledBaseCustomDefs.length > 0 ? buildCharacterCustomFieldsUpdateSchema(enabledBaseCustomDefs) : undefined
  const shape = {
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    general_description: z.string().min(1),
    ...(flags.useCharAppearance
      ? {
          baseline_appearance: z.string().min(1),
        }
      : {}),
    ...(flags.useCharPersonalityTraits ? { personality_traits: PersonalityTraitsSchema } : {}),
    ...(flags.useCharMajorFlaws ? { major_flaws: MajorFlawsStrictSchema } : {}),
    ...(flags.useCharPerks ? { perks: PerksStrictSchema } : {}),
    ...(characterCustomFields
      ? { custom_fields: characterCustomFields.optional().describe("{state.character.custom_fields}") }
      : {}),
  }

  return z.object(shape).strict() as unknown as z.ZodType<GenerateCharacterResponse>
}

export const GenerateCharacterAppearanceResponseSchema = z
  .object({
    baseline_appearance: z.string().min(1).describe("{state.character.baseline_appearance}"),
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
    general_description: z.string().trim().min(1),
    character_introductions: z.array(NPCStateStoredSchema).optional(),
  })
  .strict()

export function buildStoryResponseSchema(
  playerName: string,
  selectedNpcNames: string[],
  modules: StoryModules,
): z.ZodType<GenerateStoryResponse> {
  const flags = resolveModuleFlags(modules)
  const enabledPlayerCurrentCustomDefs = db
    .listCustomFields()
    .filter(
      (d) =>
        d.enabled &&
        d.scope === "character" &&
        d.placement === "current" &&
        isCustomFieldModuleEnabled(modules, d.id, "character"),
    )
  const playerCustomFieldShape = buildCharacterCustomFieldShape(enabledPlayerCurrentCustomDefs)
  const npcCurrentCustomDefs = db
    .listCustomFields()
    .filter((d) => d.enabled && d.scope === "character" && isCustomFieldModuleEnabled(modules, d.id, "npc"))
  const npcCustomFieldShape = buildCharacterCustomFieldShape(npcCurrentCustomDefs)
  const npcCustomFields =
    npcCurrentCustomDefs.length > 0 ? buildCharacterCustomFieldsUpdateSchema(npcCurrentCustomDefs) : undefined
  const npcSchema = buildCharacterCreationSchema(
    {
      useActivity: flags.useNpcActivity,
      useLocation: flags.useNpcLocation,
      usePersonalityTraits: flags.useNpcPersonalityTraits,
      useAppearance: flags.useNpcAppearance,
      useMajorFlaws: flags.useNpcMajorFlaws,
      usePerks: flags.useNpcPerks,
      useInventory: flags.useNpcInventory,
    },
    npcCustomFields,
  )
  const playerUpdateSchema = buildCharacterUpdateSchema(
    {
      allowLocation: flags.useCharLocation,
      allowAppearance: flags.useCharAppearance,
      allowClothing: flags.useCharAppearance,
      allowActivity: flags.useCharActivity,
      allowInventory: false,
    },
    playerCustomFieldShape,
  )
  const npcUpdateSchema = buildCharacterUpdateSchema(
    {
      allowLocation: flags.useNpcLocation,
      allowAppearance: flags.useNpcAppearance,
      allowClothing: flags.useNpcAppearance,
      allowActivity: flags.useNpcActivity,
      allowInventory: false,
    },
    npcCustomFieldShape,
  )

  const shape: Record<string, z.ZodTypeAny> = {
    title: z.string().min(1),
    opening_scenario: z.string().min(1),
    starting_location: z.string().min(1),
    starting_date: z.string().regex(DATE_REGEX, "starting_date must be YYYY-MM-DD"),
    starting_time: z.string().regex(TIME_OF_DAY_REGEX, "starting_time must be 24h HH:MM"),
    general_description: z.string().trim().min(1).describe("{state.character.general_description}"),
  }
  shape.character_introductions = modules.track_npcs
    ? z.array(npcSchema).optional()
    : z.array(npcSchema).max(0).optional()

  const trimmedPlayerName = playerName.trim()
  if (trimmedPlayerName) {
    shape[trimmedPlayerName] = playerUpdateSchema
      .optional()
      .describe(`Optional story-setup state updates for ${trimmedPlayerName}. Use the exact character name as the key.`)
  }
  if (modules.track_npcs) {
    const seen = new Set(trimmedPlayerName ? [trimmedPlayerName.toLowerCase()] : [])
    for (const rawName of selectedNpcNames) {
      const name = rawName.trim()
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      shape[name] = npcUpdateSchema
        .optional()
        .describe(
          `Optional story-setup state updates for existing character ${name}. Use the exact character name as the key.`,
        )
    }
  }

  return z
    .object(shape)
    .strict()
    .transform((value: { [key: string]: unknown; character_introductions?: unknown[] }) => ({
      ...value,
      character_introductions: (value.character_introductions ?? []).map((npc: unknown) =>
        NPCStateStoredSchema.parse(npc),
      ),
    })) as unknown as z.ZodType<GenerateStoryResponse>
}

export const GenerateChatResponseSchema = z
  .object({
    title: z.string().min(1),
    greeting: z.string().min(1),
  })
  .strict()
