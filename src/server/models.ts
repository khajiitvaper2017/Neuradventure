import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"
import { z } from "zod"

const __dirname = dirname(fileURLToPath(import.meta.url))
const TIME_OF_DAY_REGEX = /^([01][0-9]|2[0-3]):[0-5][0-9]$/
const ONE_TO_FIVE_WORDS_REGEX = /^[^\n ]+( [^\n ]+){0,4}$/
const TWO_TO_THREE_SENTENCES_REGEX = /^([^.!?\n]*[.!?][ ]*){2,3}$/
const ONE_OR_TWO_PARAGRAPHS_REGEX = /^[^\n]+(\n\n[^\n]+){0,1}$/
const THREE_TO_TWELVE_WORDS_REGEX = /^([^\n ]+[ ]+){2,11}[^\n ]+$/

const DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"] as const
const DEFAULT_RECENT_EVENTS_SUMMARY = "Nothing significant has happened yet. The situation remains stable."

const npcTraits: string[] = JSON.parse(readFileSync(join(__dirname, "../../shared/traits.json"), "utf-8"))
const npcTraitEnumValues = npcTraits.map((trait) => trait.trim()).filter((trait) => trait.length > 0)
const npcTraitLookup = new Map(npcTraitEnumValues.map((trait) => [trait.toLowerCase(), trait]))
const DEFAULT_PERSONALITY_TRAITS =
  npcTraitEnumValues.length >= 2
    ? [npcTraitEnumValues[0], npcTraitEnumValues[1]]
    : npcTraitEnumValues.length === 1
      ? [npcTraitEnumValues[0], npcTraitEnumValues[0]]
      : ["Curious", "Honest"]

const PersonalityTraitsSchema = z.array(z.string().min(1)).min(2).max(5)
const CustomTraitSchema = z.string().regex(THREE_TO_TWELVE_WORDS_REGEX, "custom_traits items must be 3-12 words")
const CustomTraitsStrictSchema = z.array(CustomTraitSchema)

function normalizeDayOfWeek(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase()
    const match = DAY_NAMES.find((day) => day.toLowerCase() === trimmed)
    if (match) return match
  }
  return "Monday"
}

function normalizeTimeOfDay(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
    if (match) {
      const hour = Number(match[1])
      const minute = Number(match[2])
      if (
        Number.isInteger(hour) &&
        Number.isInteger(minute) &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59
      ) {
        return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
      }
    }
  }
  return "00:00"
}

function normalizeCurrentScene(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      const words = trimmed.split(/\s+/).slice(0, 5)
      return words.join(" ")
    }
  }
  return "Unknown location"
}

function normalizeRecentEventsSummary(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = stripSummaryLeak(value).trim()
    if (trimmed.length > 0) {
      const matches = trimmed.match(/[^.!?]+[.!?]+/g) ?? []
      let sentences = matches.map((sentence) => sentence.trim()).filter(Boolean)
      if (sentences.length === 0) sentences = [trimmed]
      sentences = sentences.map((sentence) => (/[.!?]$/.test(sentence) ? sentence : `${sentence}.`))
      if (sentences.length === 1) sentences.push("Further details are unknown.")
      if (sentences.length > 3) sentences = sentences.slice(0, 3)
      const summary = sentences.join(" ").trim()
      if (TWO_TO_THREE_SENTENCES_REGEX.test(summary)) return summary
    }
  }
  return DEFAULT_RECENT_EVENTS_SUMMARY
}

function stripSummaryLeak(value: string): string {
  let sanitized = value
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, " ")
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, " ")
  sanitized = sanitized.replace(/(^|[\s.!?])\/\/.*$/g, "$1")
  return sanitized.trim()
}

function normalizeNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return fallback
}

function normalizePersonalityTraits(value: unknown): string[] {
  const traits: string[] = []
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") continue
      const trimmed = entry.trim()
      if (!trimmed) continue
      const canonical = npcTraitLookup.get(trimmed.toLowerCase()) ?? trimmed
      if (!traits.includes(canonical)) traits.push(canonical)
    }
  }

  for (const fallback of DEFAULT_PERSONALITY_TRAITS) {
    if (traits.length >= 2) break
    if (!traits.includes(fallback)) traits.push(fallback)
  }

  return traits.slice(0, 5)
}

function normalizeAppearance(value: unknown): { physical_description: string; current_clothing: string } {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    return {
      physical_description: normalizeNonEmptyString(obj.physical_description, "Unknown appearance"),
      current_clothing: normalizeNonEmptyString(obj.current_clothing, "Unknown clothing"),
    }
  }
  return {
    physical_description: "Unknown appearance",
    current_clothing: "Unknown clothing",
  }
}

// ─── Game State Models ─────────────────────────────────────────────────────────

export const InventoryItemSchema = z
  .object({
    name: z.string().min(1),
    description: z.string().min(1),
  })
  .strict()

export const CharacterAppearanceSchema = z
  .object({
    physical_description: z.string().min(1),
    current_clothing: z.string().min(1),
  })
  .strict()

export const MainCharacterStateSchema = z
  .object({
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    appearance: CharacterAppearanceSchema,
    personality_traits: z.array(z.string()),
    custom_traits: z.array(z.string()),
    inventory: z.array(InventoryItemSchema),
  })
  .strict()

export const NPCStateSchema = z
  .object({
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    last_known_location: z.string().min(1),
    appearance: CharacterAppearanceSchema,
    personality_traits: PersonalityTraitsSchema,
    relationship_to_player: z.string().min(1),
    notes: z.string().min(1),
  })
  .strict()

export const NPCStateStoredSchema = z
  .object({
    name: z.string().optional(),
    race: z.string().optional(),
    gender: z.string().optional(),
    last_known_location: z.string().optional(),
    appearance: z.unknown().optional(),
    personality_traits: z.unknown().optional(),
    relationship_to_player: z.string().optional(),
    notes: z.string().optional(),
  })
  .passthrough()
  .transform((value) => ({
    name: normalizeNonEmptyString(value.name, "Unknown NPC"),
    race: normalizeNonEmptyString(value.race, "Unknown"),
    gender: normalizeNonEmptyString(value.gender, "Unknown"),
    last_known_location: normalizeNonEmptyString(value.last_known_location, "Unknown location"),
    appearance: normalizeAppearance(value.appearance),
    personality_traits: normalizePersonalityTraits(value.personality_traits),
    relationship_to_player: normalizeNonEmptyString(value.relationship_to_player, "Neutral"),
    notes: normalizeNonEmptyString(value.notes, "None"),
  }))
  .pipe(NPCStateSchema)

export const WorldStateSchema = z
  .object({
    current_scene: z.string().min(1).regex(ONE_TO_FIVE_WORDS_REGEX, "current_scene must be 1-5 words"),
    day_of_week: z.enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]),
    time_of_day: z.string().regex(TIME_OF_DAY_REGEX, "time_of_day must be 24h HH:MM"),
    recent_events_summary: z.preprocess(
      (value) => (typeof value === "string" ? stripSummaryLeak(value) : value),
      z
        .string()
        .min(1)
        .regex(TWO_TO_THREE_SENTENCES_REGEX, "recent_events_summary must be 2-3 sentences"),
    ),
  })
  .strict()

export const WorldStateStoredSchema = z
  .object({
    current_scene: z.string().optional(),
    day_of_week: z.string().optional(),
    time_of_day: z.string().optional(),
    recent_events_summary: z.string().optional(),
  })
  .passthrough()
  .transform((value) => ({
    current_scene: normalizeCurrentScene(value.current_scene),
    day_of_week: normalizeDayOfWeek(value.day_of_week),
    time_of_day: normalizeTimeOfDay(value.time_of_day),
    recent_events_summary: normalizeRecentEventsSummary(value.recent_events_summary),
  }))
  .pipe(WorldStateSchema)

// ─── LLM Response Schema ──────────────────────────────────────────────────────

const npcStateUpdateShape = {
  name: z.string().min(1),
  race: z.string().min(1).optional(),
  gender: z.string().min(1).optional(),
  personality_traits: PersonalityTraitsSchema.optional(),
  set_location: z.string().min(1).optional(),
  set_appearance: z.string().min(1).optional(),
  set_clothing: z.string().min(1).optional(),
  set_relationship: z.string().min(1).optional(),
  set_notes: z.string().min(1).optional(),
}

export const NPCStateUpdateBaseSchema = z.object(npcStateUpdateShape).strict()

export const buildNPCStateUpdateSchema = (nameSchema: z.ZodType<string>): z.ZodType<unknown> => {
  const base = NPCStateUpdateBaseSchema.extend({ name: nameSchema })
  const withRace = base.extend({ race: z.string().min(1) })
  const withGender = base.extend({ gender: z.string().min(1) })
  const withTraits = base.extend({ personality_traits: PersonalityTraitsSchema })
  const withLocation = base.extend({ set_location: z.string().min(1) })
  const withAppearance = base.extend({ set_appearance: z.string().min(1) })
  const withClothing = base.extend({ set_clothing: z.string().min(1) })
  const withRelationship = base.extend({ set_relationship: z.string().min(1) })
  const withNotes = base.extend({ set_notes: z.string().min(1) })
  return z.union([
    withRace,
    withGender,
    withTraits,
    withLocation,
    withAppearance,
    withClothing,
    withRelationship,
    withNotes,
  ])
}

export const NPCStateUpdateSchema = buildNPCStateUpdateSchema(z.string().min(1))

export const NPCCreationSchema = z
  .object({
    name: z.string().min(1),
    race: z.string().min(1),
    gender: z.string().min(1),
    personality_traits: PersonalityTraitsSchema,
    set_location: z.string().min(1),
    set_appearance: z.string().min(1),
    set_clothing: z.string().min(1),
    set_relationship: z.string().min(1),
    set_notes: z.string().min(1),
  })
  .strict()

// ─── Flag-gated sections (discriminated oneOf via const boolean) ─────────────

export const AppearanceChangeSection = z.union([
  z.object({ changed: z.literal(false) }).strict(),
  z.object({ changed: z.literal(true), description: z.string().min(1) }).strict(),
])

export const ClothingChangeSection = z.union([
  z.object({ changed: z.literal(false) }).strict(),
  z.object({ changed: z.literal(true), description: z.string().min(1) }).strict(),
])

export const InventoryChangeSection = z.union([
  z.object({ changed: z.literal(false) }).strict(),
  z.object({ changed: z.literal(true), items: z.array(InventoryItemSchema) }).strict(),
])

export const buildNPCChangesSection = (nameSchema: z.ZodType<string>) => {
  const updateSchema = buildNPCStateUpdateSchema(nameSchema)
  return z.union([
    z.object({ has_updates: z.literal(false) }).strict(),
    z.object({ has_updates: z.literal(true), updates: z.array(updateSchema).min(1) }).strict(),
  ])
}
export const NPCChangesSection = buildNPCChangesSection(z.string().min(1))

export const NPCIntroductionsSection = z.union([
  z.object({ has_new_npcs: z.literal(false) }).strict(),
  z.object({ has_new_npcs: z.literal(true), npcs: z.array(NPCCreationSchema).min(1) }).strict(),
])

export const TurnResponseSchema = z
  .object({
    narrative_text: z
      .string()
      .min(1)
      .regex(ONE_OR_TWO_PARAGRAPHS_REGEX, "narrative_text must be 1-2 paragraphs separated by \\n\\n"),
    world_state_update: WorldStateSchema,
    appearance_change: AppearanceChangeSection,
    clothing_change: ClothingChangeSection,
    inventory_change: InventoryChangeSection,
    npc_changes: NPCChangesSection,
    npc_introductions: NPCIntroductionsSection,
  })
  .strict()

// ─── Generation Response Schemas ─────────────────────────────────────────────

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

// ─── API Request / Response Bodies ────────────────────────────────────────────

export const CreateCharacterRequestSchema = z.object({
  name: z.string().min(1),
  race: z.string().min(1),
  gender: z.string().min(1),
  appearance: CharacterAppearanceSchema,
  personality_traits: z.array(z.string()),
  custom_traits: z.array(z.string()),
})

export const UpdateCharacterRequestSchema = CreateCharacterRequestSchema.partial()

export const CreateStoryRequestSchema = z.object({
  title: z.string().min(1),
  opening_scenario: z.string().min(1),
  starting_scene: z.string().min(1).optional(),
  character_id: z.number().int().optional(),
  character_data: z
    .object({
      name: z.string().min(1),
      race: z.string().min(1),
      gender: z.string().min(1),
      appearance: CharacterAppearanceSchema,
      personality_traits: z.array(z.string()),
      custom_traits: z.array(z.string()),
    })
    .optional(),
  npcs: z.array(NPCStateSchema).optional(),
})

export const UpdateStoryRequestSchema = z.object({
  title: z.string().min(1).optional(),
  opening_scenario: z.string().min(1).optional(),
})

export const UpdateStoryStateRequestSchema = z
  .object({
    character: MainCharacterStateSchema.optional(),
    npcs: z.array(NPCStateStoredSchema).optional(),
  })
  .refine((value) => value.character || value.npcs, {
    message: "Provide character or npcs updates",
  })

export const UpdateTurnRequestSchema = z.object({
  player_input: z.string().min(1).optional(),
  narrative_text: z.string().min(1).optional(),
})

export const TakeTurnRequestSchema = z
  .object({
    story_id: z.number().int(),
    player_input: z.string(),
    action_mode: z.enum(["do", "say", "story"]).default("do"),
    request_id: z.string().min(1).optional(),
  })
  .refine((v) => v.action_mode === "story" || v.player_input.trim().length > 0, {
    message: "player_input is required unless action_mode is story",
  })

export const RegenerateLastRequestSchema = z.object({
  story_id: z.number().int(),
  action_mode: z.enum(["do", "say", "story"]).optional(),
})

export const ImpersonateRequestSchema = z.object({
  story_id: z.number().int(),
  action_mode: z.enum(["do", "say", "story"]).default("do"),
})

export const CancelLastRequestSchema = z.object({
  story_id: z.number().int(),
})

export const UndoCancelRequestSchema = z.object({
  story_id: z.number().int(),
})

export const SelectTurnVariantRequestSchema = z.object({
  variant_id: z.number().int(),
})

// ─── Inferred Types ────────────────────────────────────────────────────────────

export type InventoryItem = z.infer<typeof InventoryItemSchema>
export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>
export type MainCharacterState = z.infer<typeof MainCharacterStateSchema>
export type NPCState = z.infer<typeof NPCStateSchema>
export type WorldState = z.infer<typeof WorldStateSchema>
export type TurnResponse = z.infer<typeof TurnResponseSchema>
export type NPCStateUpdate = z.infer<typeof NPCStateUpdateSchema>
export type NPCCreation = z.infer<typeof NPCCreationSchema>

export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>
export type CreateStoryRequest = z.infer<typeof CreateStoryRequestSchema>
export type UpdateStoryStateRequest = z.infer<typeof UpdateStoryStateRequestSchema>
export type TakeTurnRequest = z.infer<typeof TakeTurnRequestSchema>
export type RegenerateLastRequest = z.infer<typeof RegenerateLastRequestSchema>
export type ImpersonateRequest = z.infer<typeof ImpersonateRequestSchema>
export type CancelLastRequest = z.infer<typeof CancelLastRequestSchema>
export type UndoCancelRequest = z.infer<typeof UndoCancelRequestSchema>
export type SelectTurnVariantRequest = z.infer<typeof SelectTurnVariantRequestSchema>
export type GenerateCharacterResponse = z.infer<typeof GenerateCharacterResponseSchema>
export type GenerateCharacterAppearanceResponse = z.infer<typeof GenerateCharacterAppearanceResponseSchema>
export type GenerateCharacterClothingResponse = z.infer<typeof GenerateCharacterClothingResponseSchema>
export type GenerateCharacterTraitsResponse = z.infer<typeof GenerateCharacterTraitsResponseSchema>
export type GenerateStoryResponse = z.infer<typeof GenerateStoryResponseSchema>
