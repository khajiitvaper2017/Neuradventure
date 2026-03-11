import { z } from "zod"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { ONE_TO_FIVE_WORDS_REGEX, TIME_OF_DAY_REGEX, TWO_TO_THREE_SENTENCES_REGEX } from "./constants.js"
import {
  normalizeAppearance,
  normalizeCurrentScene,
  normalizeDayOfWeek,
  normalizeNonEmptyString,
  normalizePersonalityTraits,
  normalizeRecentEventsSummary,
  normalizeTimeOfDay,
  stripSummaryLeak,
} from "./normalizers.js"

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
