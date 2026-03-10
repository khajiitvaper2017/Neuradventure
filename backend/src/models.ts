import { z } from "zod"

// ─── Game State Models ─────────────────────────────────────────────────────────

export const InventoryItemSchema = z.object({
  name: z.string(),
  description: z.string(),
})

export const CharacterAppearanceSchema = z.object({
  physical_description: z.string(),
  current_clothing: z.string(),
})

export const MainCharacterStateSchema = z.object({
  name: z.string(),
  race: z.string(),
  gender: z.string().min(1),
  appearance: CharacterAppearanceSchema,
  personality_traits: z.array(z.string()),
  custom_traits: z.array(z.string()),
  inventory: z.array(InventoryItemSchema),
})

export const NPCStateSchema = z.object({
  name: z.string(),
  race: z.string(),
  last_known_location: z.string(),
  appearance: CharacterAppearanceSchema,
  personality_traits: z.array(z.string()),
  relationship_to_player: z.string(),
  notes: z.string(),
})

export const WorldStateSchema = z.object({
  current_scene: z.string(),
  time_of_day: z.string(),
  recent_events_summary: z.string(),
})

// ─── LLM Response Schema ──────────────────────────────────────────────────────

export const NPCStateUpdateSchema = z.object({
  name: z.string(),
  last_known_location: z.string().optional(),
  appearance_update: z.string().optional(),
  clothing_update: z.string().optional(),
  relationship_change: z.string().optional(),
  notes_update: z.string().optional(),
})

export const PlayerStateUpdateSchema = z.object({
  appearance_update: z.string().optional(),
  clothing_update: z.string().optional(),
  inventory_add: z.array(InventoryItemSchema).default([]),
  inventory_remove: z.array(z.string()).default([]),
})

export const TurnResponseSchema = z.object({
  narrative_text: z.string(),
  world_state_update: WorldStateSchema,
  player_state_update: PlayerStateUpdateSchema,
  npc_updates: z.array(NPCStateUpdateSchema).default([]),
  new_npcs: z.array(NPCStateSchema).default([]),
})

// ─── Generation Response Schemas ─────────────────────────────────────────────

export const GenerateCharacterResponseSchema = z.object({
  name: z.string(),
  race: z.string(),
  gender: z.string().min(1),
  physical_description: z.string(),
  current_clothing: z.string(),
  personality_traits: z.array(z.string()).max(5),
  custom_traits: z.array(z.string()),
})

export const GenerateCharacterAppearanceResponseSchema = z.object({
  physical_description: z.string(),
  current_clothing: z.string(),
})

export const GenerateCharacterClothingResponseSchema = z.object({
  current_clothing: z.string(),
})

export const GenerateCharacterTraitsResponseSchema = z.object({
  personality_traits: z.array(z.string()).max(5),
  custom_traits: z.array(z.string()),
})

export const GenerateStoryResponseSchema = z.object({
  title: z.string(),
  opening_scenario: z.string(),
})

// ─── API Request / Response Bodies ────────────────────────────────────────────

export const CreateCharacterRequestSchema = z.object({
  name: z.string().min(1),
  race: z.string(),
  gender: z.string().min(1),
  appearance: CharacterAppearanceSchema,
  personality_traits: z.array(z.string()),
  custom_traits: z.array(z.string()),
})

export const UpdateCharacterRequestSchema = CreateCharacterRequestSchema.partial()

export const CreateStoryRequestSchema = z.object({
  title: z.string().min(1),
  opening_scenario: z.string().min(1),
  character_id: z.number().int().optional(),
  character_data: z
    .object({
      name: z.string().min(1),
      race: z.string(),
      gender: z.string().min(1),
      appearance: CharacterAppearanceSchema,
      personality_traits: z.array(z.string()),
      custom_traits: z.array(z.string()),
    })
    .optional(),
})

export const UpdateStoryRequestSchema = z.object({
  title: z.string().min(1).optional(),
  opening_scenario: z.string().min(1).optional(),
})

export const TakeTurnRequestSchema = z.object({
  story_id: z.number().int(),
  player_input: z.string().min(1),
  action_mode: z.enum(["do", "say", "story"]).default("do"),
})

// ─── Inferred Types ────────────────────────────────────────────────────────────

export type InventoryItem = z.infer<typeof InventoryItemSchema>
export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>
export type MainCharacterState = z.infer<typeof MainCharacterStateSchema>
export type NPCState = z.infer<typeof NPCStateSchema>
export type WorldState = z.infer<typeof WorldStateSchema>
export type TurnResponse = z.infer<typeof TurnResponseSchema>
export type NPCStateUpdate = z.infer<typeof NPCStateUpdateSchema>

export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>
export type CreateStoryRequest = z.infer<typeof CreateStoryRequestSchema>
export type TakeTurnRequest = z.infer<typeof TakeTurnRequestSchema>
export type GenerateCharacterResponse = z.infer<typeof GenerateCharacterResponseSchema>
export type GenerateCharacterAppearanceResponse = z.infer<typeof GenerateCharacterAppearanceResponseSchema>
export type GenerateCharacterClothingResponse = z.infer<typeof GenerateCharacterClothingResponseSchema>
export type GenerateCharacterTraitsResponse = z.infer<typeof GenerateCharacterTraitsResponseSchema>
export type GenerateStoryResponse = z.infer<typeof GenerateStoryResponseSchema>
