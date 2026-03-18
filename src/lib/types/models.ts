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
import { NPCStateUpdateBaseSchema } from "@/domain/story/schemas/npc-state-update-base"
import {
  SetCurrentAppearanceSection,
  CurrentClothingSection,
  SetCurrentInventorySection,
  NPCChangesSection,
  NPCIntroductionsSection,
  NPCStateUpdateSchema,
  NPCCreationSchema,
  TurnResponseSchema,
  buildNPCChangesSection,
  buildNPCStateUpdateSchema,
  buildTurnCharacterUpdateSchema,
} from "@/domain/story/schemas/llm-response"
import {
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateChatResponseSchema,
  StoryResponseSchema,
  buildGenerateCharacterResponseSchema,
  buildStoryResponseSchema,
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
  NPCStateUpdateBaseSchema,
  buildNPCStateUpdateSchema,
  NPCStateUpdateSchema,
  NPCCreationSchema,
  SetCurrentAppearanceSection,
  CurrentClothingSection,
  SetCurrentInventorySection,
  buildNPCChangesSection,
  NPCChangesSection,
  NPCIntroductionsSection,
  TurnResponseSchema,
  buildTurnCharacterUpdateSchema,
  GenerateCharacterResponseSchema,
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateChatResponseSchema,
  StoryResponseSchema,
  buildGenerateCharacterResponseSchema,
  buildStoryResponseSchema,
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
export type TurnResponse = z.infer<typeof TurnResponseSchema> & Record<string, unknown>
export type NPCStateUpdate = z.infer<typeof NPCStateUpdateSchema>
export type NPCCreation = z.infer<typeof NPCCreationSchema>

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
export type GenerateCharacterResponse = z.infer<typeof GenerateCharacterResponseSchema>
export type GenerateCharacterAppearanceResponse = z.infer<typeof GenerateCharacterAppearanceResponseSchema>
export type GenerateCharacterClothingResponse = z.infer<typeof GenerateCharacterClothingResponseSchema>
export type GenerateCharacterTraitsResponse = z.infer<typeof GenerateCharacterTraitsResponseSchema>
export type GenerateChatResponse = z.infer<typeof GenerateChatResponseSchema>
export type StoryResponse = z.infer<typeof StoryResponseSchema>
