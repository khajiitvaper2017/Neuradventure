import { z } from "zod"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { TIME_OF_DAY_REGEX } from "./constants.js"
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
import { desc } from "./field-descriptions.js"

export const InventoryItemSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.inventory_item.name")),
    description: z.string().min(1).describe(desc("state.inventory_item.description")),
  })
  .strict()

export const CharacterAppearanceSchema = z
  .object({
    physical_description: z.string().min(1).describe(desc("state.appearance.physical_description")),
    current_clothing: z.string().min(1).describe(desc("state.appearance.current_clothing")),
  })
  .strict()

export const MainCharacterStateSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.main_character.name")),
    race: z.string().min(1).describe(desc("state.main_character.race")),
    gender: z.string().min(1).describe(desc("state.main_character.gender")),
    appearance: CharacterAppearanceSchema.describe(desc("state.main_character.appearance")),
    personality_traits: z.array(z.string()).describe(desc("state.main_character.personality_traits")),
    custom_traits: z.array(z.string()).describe(desc("state.main_character.custom_traits")),
    inventory: z.array(InventoryItemSchema).describe(desc("state.main_character.inventory")),
  })
  .strict()

export const NPCStateSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.npc_state.name")),
    race: z.string().min(1).describe(desc("state.npc_state.race")),
    gender: z.string().min(1).describe(desc("state.npc_state.gender")),
    last_known_location: z.string().min(1).describe(desc("state.npc_state.last_known_location")),
    appearance: CharacterAppearanceSchema.describe(desc("state.npc_state.appearance")),
    personality_traits: PersonalityTraitsSchema.describe(desc("state.npc_state.personality_traits")),
    relationship_to_player: z.string().min(1).describe(desc("state.npc_state.relationship_to_player")),
    notes: z.string().min(1).describe(desc("state.npc_state.notes")),
  })
  .strict()

export const NPCStateStoredSchema = z
  .object({
    name: z.string().optional().describe(desc("state.npc_state.name")),
    race: z.string().optional().describe(desc("state.npc_state.race")),
    gender: z.string().optional().describe(desc("state.npc_state.gender")),
    last_known_location: z.string().optional().describe(desc("state.npc_state.last_known_location")),
    appearance: z.unknown().optional().describe(desc("state.npc_state.appearance")),
    personality_traits: z.unknown().optional().describe(desc("state.npc_state.personality_traits")),
    relationship_to_player: z.string().optional().describe(desc("state.npc_state.relationship_to_player")),
    notes: z.string().optional().describe(desc("state.npc_state.notes")),
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
    current_scene: z
      .string()
      .min(1)
      .describe(desc("llm.world_state_update.current_scene")),
    day_of_week: z
      .enum(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"])
      .describe(desc("llm.world_state_update.day_of_week")),
    time_of_day: z
      .string()
      .regex(TIME_OF_DAY_REGEX, "time_of_day must be 24h HH:MM")
      .describe(desc("llm.world_state_update.time_of_day")),
    recent_events_summary: z.preprocess(
      (value) => (typeof value === "string" ? stripSummaryLeak(value) : value),
      z
        .string()
        .min(1),
    ).describe(desc("llm.world_state_update.recent_events_summary")),
  })
  .describe(desc("llm.turn_response.world_state_update"))
  .strict()

export const WorldStateStoredSchema = z
  .object({
    current_scene: z.string().optional().describe(desc("llm.world_state_update.current_scene")),
    day_of_week: z.string().optional().describe(desc("llm.world_state_update.day_of_week")),
    time_of_day: z.string().optional().describe(desc("llm.world_state_update.time_of_day")),
    recent_events_summary: z.string().optional().describe(desc("llm.world_state_update.recent_events_summary")),
  })
  .passthrough()
  .transform((value) => ({
    current_scene: normalizeCurrentScene(value.current_scene),
    day_of_week: normalizeDayOfWeek(value.day_of_week),
    time_of_day: normalizeTimeOfDay(value.time_of_day),
    recent_events_summary: normalizeRecentEventsSummary(value.recent_events_summary),
  }))
  .pipe(WorldStateSchema)
