import { z } from "zod"
import {
  CharacterAppearanceSchema,
  InventoryItemSchema,
  LocationItemSchema,
  LocationSchema,
  MainCharacterStateStoredSchema,
  CharacterStateSchema,
  CharacterStateStoredSchema,
  MainCharacterStateSchema,
  NPCStateSchema,
  NPCStateStoredSchema,
  WorldStateSchema,
  WorldStateStoredSchema,
} from "../schemas/game-state.js"
import { NPCStateUpdateBaseSchema } from "../schemas/npc-state-update-base.js"
import {
  AppearanceChangeSection,
  ClothingChangeSection,
  InventoryChangeSection,
  NPCChangesSection,
  NPCIntroductionsSection,
  NPCStateUpdateSchema,
  NPCCreationSchema,
  TurnResponseSchema,
  buildNPCChangesSection,
  buildNPCStateUpdateSchema,
} from "../schemas/llm-response.js"
import {
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateChatResponseSchema,
  GenerateStoryResponseSchema,
} from "../schemas/generation-response.js"
import {
  CancelLastRequestSchema,
  CreateChatRequestSchema,
  CreateCharacterRequestSchema,
  CreateStoryRequestSchema,
  ImpersonateRequestSchema,
  RegenerateLastRequestSchema,
  SendChatMessageRequestSchema,
  SelectTurnVariantRequestSchema,
  TakeTurnRequestSchema,
  UndoCancelRequestSchema,
  UpdateCharacterRequestSchema,
  UpdateStoryRequestSchema,
  UpdateStoryStateRequestSchema,
  UpdateTurnRequestSchema,
} from "../schemas/requests.js"

export {
  InventoryItemSchema,
  LocationItemSchema,
  LocationSchema,
  CharacterAppearanceSchema,
  CharacterStateSchema,
  CharacterStateStoredSchema,
  MainCharacterStateSchema,
  MainCharacterStateStoredSchema,
  NPCStateSchema,
  NPCStateStoredSchema,
  WorldStateSchema,
  WorldStateStoredSchema,
  NPCStateUpdateBaseSchema,
  buildNPCStateUpdateSchema,
  NPCStateUpdateSchema,
  NPCCreationSchema,
  AppearanceChangeSection,
  ClothingChangeSection,
  InventoryChangeSection,
  buildNPCChangesSection,
  NPCChangesSection,
  NPCIntroductionsSection,
  TurnResponseSchema,
  GenerateCharacterResponseSchema,
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateChatResponseSchema,
  GenerateStoryResponseSchema,
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
  SendChatMessageRequestSchema,
}

export type InventoryItem = z.infer<typeof InventoryItemSchema>
export type LocationItem = z.infer<typeof LocationItemSchema>
export type Location = z.infer<typeof LocationSchema>
export type CharacterAppearance = z.infer<typeof CharacterAppearanceSchema>
export type CharacterState = z.infer<typeof CharacterStateSchema>
export type MainCharacterState = z.infer<typeof MainCharacterStateSchema>
export type NPCState = z.infer<typeof NPCStateSchema>
export type WorldState = z.infer<typeof WorldStateSchema>
export type TurnResponse = z.infer<typeof TurnResponseSchema>
export type NPCStateUpdate = z.infer<typeof NPCStateUpdateSchema>
export type NPCCreation = z.infer<typeof NPCCreationSchema>

export type CreateCharacterRequest = z.infer<typeof CreateCharacterRequestSchema>
export type CreateStoryRequest = z.infer<typeof CreateStoryRequestSchema>
export type UpdateStoryStateRequest = z.infer<typeof UpdateStoryStateRequestSchema>
export type CreateChatRequest = z.infer<typeof CreateChatRequestSchema>
export type SendChatMessageRequest = z.infer<typeof SendChatMessageRequestSchema>
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
export type GenerateChatResponse = z.infer<typeof GenerateChatResponseSchema>
export type GenerateStoryResponse = z.infer<typeof GenerateStoryResponseSchema>
