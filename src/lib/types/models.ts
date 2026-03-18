import { z } from "zod"
import {
  InventoryItemSchema,
  MainCharacterStateStoredSchema,
  CharacterStateSchema,
  CharacterStateStoredSchema,
  MainCharacterStateSchema,
  NPCStateSchema,
  NPCStateStoredSchema,
  WorldStateUpdateSchema,
  WorldStateSchema,
  WorldStateStoredSchema,
} from "@/domain/story/schemas/game-state"
import { StoryModulesSchema } from "@/domain/story/schemas/story-modules"
import {
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateChatResponseSchema,
} from "@/domain/story/schemas/story-response"
import {
  CancelLastRequestSchema,
  ChatIdRequestSchema,
  CreateChatRequestSchema,
  CreateCharacterRequestSchema,
  CreateStoryRequestSchema,
  ImpersonateRequestSchema,
  RegenerateLastRequestSchema,
  SetNextChatSpeakerRequestSchema,
  SendChatMessageRequestSchema,
  SelectTurnVariantRequestSchema,
  TakeTurnRequestSchema,
  UndoCancelRequestSchema,
  UpdateChatMessageRequestSchema,
  UpdateChatRequestSchema,
  UpdateCharacterRequestSchema,
  UpdateStoryRequestSchema,
  UpdateStoryStateRequestSchema,
  UpdateTurnRequestSchema,
} from "@/domain/story/schemas/requests"
export {
  InventoryItemSchema,
  CharacterStateSchema,
  CharacterStateStoredSchema,
  MainCharacterStateSchema,
  MainCharacterStateStoredSchema,
  NPCStateSchema,
  NPCStateStoredSchema,
  StoryModulesSchema,
  WorldStateUpdateSchema,
  WorldStateSchema,
  WorldStateStoredSchema,
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateChatResponseSchema,
  CreateCharacterRequestSchema,
  UpdateCharacterRequestSchema,
  CreateStoryRequestSchema,
  UpdateStoryRequestSchema,
  UpdateStoryStateRequestSchema,
  UpdateTurnRequestSchema,
  TakeTurnRequestSchema,
  RegenerateLastRequestSchema,
  ImpersonateRequestSchema,
  CancelLastRequestSchema,
  UndoCancelRequestSchema,
  SelectTurnVariantRequestSchema,
  CreateChatRequestSchema,
  UpdateChatRequestSchema,
  UpdateChatMessageRequestSchema,
  ChatIdRequestSchema,
  SetNextChatSpeakerRequestSchema,
  SendChatMessageRequestSchema,
}

export type InventoryItem = z.infer<typeof InventoryItemSchema>
export type CharacterState = z.infer<typeof CharacterStateSchema>
export type MainCharacterState = z.infer<typeof MainCharacterStateSchema>
export type NPCState = z.infer<typeof NPCStateSchema>
export type StoryModules = z.infer<typeof StoryModulesSchema>
export type WorldStateUpdate = z.infer<typeof WorldStateUpdateSchema>
export type WorldState = z.infer<typeof WorldStateSchema>
export type CharacterCreation = Pick<NPCState, "name" | "race" | "gender" | "general_description"> &
  Partial<
    Pick<
      NPCState,
      | "current_location"
      | "current_activity"
      | "baseline_appearance"
      | "current_appearance"
      | "current_clothing"
      | "personality_traits"
      | "major_flaws"
      | "perks"
      | "inventory"
    >
  > & {
    custom_fields?: Record<string, string | string[]>
  }
export type TurnResponse = {
  narrative_text: string
  background_events?: string
  world_state_update: WorldStateUpdate
  character_introductions?: CharacterCreation[]
} & Record<string, unknown>

export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>
export type CreateStoryRequest = z.infer<typeof CreateStoryRequestSchema>
export type UpdateStoryStateRequest = z.infer<typeof UpdateStoryStateRequestSchema>
export type CreateChatRequest = z.infer<typeof CreateChatRequestSchema>
export type UpdateChatRequest = z.infer<typeof UpdateChatRequestSchema>
export type UpdateChatMessageRequest = z.infer<typeof UpdateChatMessageRequestSchema>
export type ChatIdRequest = z.infer<typeof ChatIdRequestSchema>
export type SetNextChatSpeakerRequest = z.infer<typeof SetNextChatSpeakerRequestSchema>
export type SendChatMessageRequest = z.infer<typeof SendChatMessageRequestSchema>
export type TakeTurnRequest = z.infer<typeof TakeTurnRequestSchema>
export type RegenerateLastRequest = z.infer<typeof RegenerateLastRequestSchema>
export type ImpersonateRequest = z.infer<typeof ImpersonateRequestSchema>
export type CancelLastRequest = z.infer<typeof CancelLastRequestSchema>
export type UndoCancelRequest = z.infer<typeof UndoCancelRequestSchema>
export type SelectTurnVariantRequest = z.infer<typeof SelectTurnVariantRequestSchema>
