import { z } from "zod"
import { PersonalityTraitsSchema } from "./personality-traits.js"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "./constants.js"
import {
  normalizeAppearance,
  normalizeCurrentScene,
  normalizeCurrentDate,
  normalizeLocations,
  normalizeNonEmptyString,
  normalizePersonalityTraits,
  normalizeRecentEventsSummary,
  normalizeTimeOfDay,
  normalizeTraitList,
  normalizeRelationshipScores,
  stripSummaryLeak,
} from "./normalizers.js"
import { desc } from "./field-descriptions.js"

export const InventoryItemSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.inventory_item.name")),
    description: z.string().min(1).describe(desc("state.inventory_item.description")),
  })
  .strict()

export const LocationItemSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.location_item.name")),
    description: z.string().min(1).describe(desc("state.location_item.description")),
  })
  .strict()

export const LocationSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.location.name")),
    description: z.string().min(1).describe(desc("state.location.description")),
    characters: z.array(z.string().min(1)).describe(desc("state.location.characters")),
    available_items: z.array(LocationItemSchema).describe(desc("state.location.available_items")),
  })
  .strict()

const LocationsSchema = z
  .array(LocationSchema)
  .min(1)
  .superRefine((locations, ctx) => {
    const seen = new Set<string>()
    locations.forEach((location, index) => {
      const key = location.name.trim().toLowerCase()
      if (!key) return
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Location names must be unique",
          path: [index, "name"],
        })
      } else {
        seen.add(key)
      }
    })
  })

export const CharacterAppearanceSchema = z
  .object({
    baseline_appearance: z.string().min(1).describe(desc("state.appearance.baseline_appearance")),
    current_appearance: z.string().min(1).describe(desc("state.appearance.current_appearance")),
    current_clothing: z.string().min(1).describe(desc("state.appearance.current_clothing")),
  })
  .strict()

export const RelationshipScoreSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.relationship_scores.name")),
    affinity: z.number().int().min(-100).max(100).describe(desc("state.relationship_scores.affinity")),
  })
  .strict()

export const RelationshipScoresSchema = z
  .array(RelationshipScoreSchema)
  .describe(desc("state.relationship_scores.entries"))
  .superRefine((scores, ctx) => {
    const seen = new Set<string>()
    scores.forEach((score, index) => {
      const key = score.name.trim().toLowerCase()
      if (!key) return
      if (seen.has(key)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Relationship score names must be unique",
          path: [index, "name"],
        })
      } else {
        seen.add(key)
      }
    })
  })

export const QuirksSchema = z.array(z.string().min(1)).max(6).describe(desc("traits.quirks"))
export const PerksSchema = z.array(z.string().min(1)).max(6).describe(desc("traits.perks"))

export const CharacterStateSchema = z
  .object({
    name: z.string().min(1).describe(desc("state.character.name")),
    race: z.string().min(1).describe(desc("state.character.race")),
    gender: z.string().min(1).describe(desc("state.character.gender")),
    current_location: z.string().min(1).describe(desc("state.character.current_location")),
    appearance: CharacterAppearanceSchema.describe(desc("state.character.appearance")),
    baseline_description: z.string().min(1).describe(desc("state.character.baseline_description")),
    current_activity: z.string().min(1).describe(desc("state.character.current_activity")),
    personality_traits: PersonalityTraitsSchema.describe(desc("state.character.personality_traits")),
    quirks: QuirksSchema.describe(desc("state.character.quirks")),
    perks: PerksSchema.describe(desc("state.character.perks")),
    relationship_scores: RelationshipScoresSchema.describe(desc("state.character.relationship_scores")),
    inventory: z.array(InventoryItemSchema).describe(desc("state.character.inventory")),
  })
  .strict()

export const MainCharacterStateSchema = CharacterStateSchema

export const NPCStateSchema = CharacterStateSchema

function normalizeInventoryItems(value: unknown): { name: string; description: string }[] {
  if (!Array.isArray(value)) return []
  const items: { name: string; description: string }[] = []
  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue
    const obj = entry as Record<string, unknown>
    const name = normalizeNonEmptyString(obj.name, "")
    if (!name) continue
    const description = normalizeNonEmptyString(obj.description, "Unknown item")
    items.push({ name, description })
  }
  return items
}

export const CharacterStateStoredSchema = z
  .object({
    name: z.string().optional().describe(desc("state.character.name")),
    race: z.string().optional().describe(desc("state.character.race")),
    gender: z.string().optional().describe(desc("state.character.gender")),
    current_location: z.string().optional().describe(desc("state.character.current_location")),
    last_known_location: z.string().optional().describe(desc("state.character.current_location")),
    appearance: z.unknown().optional().describe(desc("state.character.appearance")),
    personality_traits: z.unknown().optional().describe(desc("state.character.personality_traits")),
    quirks: z.unknown().optional().describe(desc("state.character.quirks")),
    perks: z.unknown().optional().describe(desc("state.character.perks")),
    baseline_description: z.string().optional().describe(desc("state.character.baseline_description")),
    current_activity: z.string().optional().describe(desc("state.character.current_activity")),
    relationship_scores: z.unknown().optional().describe(desc("state.character.relationship_scores")),
    inventory: z.unknown().optional().describe(desc("state.character.inventory")),
    notes: z.string().optional().describe(desc("state.character.current_activity")),
  })
  .passthrough()
  .transform((value) => ({
    name: normalizeNonEmptyString(value.name, "Unknown NPC"),
    race: normalizeNonEmptyString(value.race, "Unknown"),
    gender: normalizeNonEmptyString(value.gender, "Unknown"),
    current_location: normalizeNonEmptyString(value.current_location ?? value.last_known_location, "Unknown location"),
    appearance: normalizeAppearance(value.appearance),
    personality_traits: normalizePersonalityTraits(value.personality_traits),
    quirks: normalizeTraitList(value.quirks ?? (value as Record<string, unknown>).custom_traits, 6),
    perks: normalizeTraitList(value.perks, 6),
    baseline_description: normalizeNonEmptyString(value.baseline_description, "Unknown background"),
    current_activity: normalizeNonEmptyString(value.current_activity ?? value.notes, "Unknown activity"),
    relationship_scores: normalizeRelationshipScores(value.relationship_scores),
    inventory: normalizeInventoryItems(value.inventory),
  }))
  .pipe(CharacterStateSchema)

export const MainCharacterStateStoredSchema = CharacterStateStoredSchema
export const NPCStateStoredSchema = CharacterStateStoredSchema

export const WorldStateSchema = z
  .object({
    current_scene: z.string().min(1).describe(desc("llm.world_state_update.current_scene")),
    current_date: z
      .string()
      .regex(DATE_REGEX, "current_date must be YYYY-MM-DD")
      .describe(desc("llm.world_state_update.current_date")),
    time_of_day: z
      .string()
      .regex(TIME_OF_DAY_REGEX, "time_of_day must be 24h HH:MM")
      .describe(desc("llm.world_state_update.time_of_day")),
    recent_events_summary: z
      .preprocess((value) => (typeof value === "string" ? stripSummaryLeak(value) : value), z.string().min(1))
      .describe(desc("llm.world_state_update.recent_events_summary")),
    locations: LocationsSchema.describe(desc("llm.world_state_update.locations")),
  })
  .describe(desc("llm.turn_response.world_state_update"))
  .strict()

export const WorldStateStoredSchema = z
  .object({
    current_scene: z.string().optional().describe(desc("llm.world_state_update.current_scene")),
    current_date: z.string().optional().describe(desc("llm.world_state_update.current_date")),
    time_of_day: z.string().optional().describe(desc("llm.world_state_update.time_of_day")),
    recent_events_summary: z.string().optional().describe(desc("llm.world_state_update.recent_events_summary")),
    locations: z.unknown().optional().describe(desc("llm.world_state_update.locations")),
  })
  .passthrough()
  .transform((value) => {
    const currentScene = normalizeCurrentScene(value.current_scene)
    const legacyDayOfWeek = (value as Record<string, unknown>).day_of_week
    return {
      current_scene: currentScene,
      current_date: normalizeCurrentDate(value.current_date ?? legacyDayOfWeek),
      time_of_day: normalizeTimeOfDay(value.time_of_day),
      recent_events_summary: normalizeRecentEventsSummary(value.recent_events_summary),
      locations: normalizeLocations(value.locations, currentScene),
    }
  })
  .pipe(WorldStateSchema)
