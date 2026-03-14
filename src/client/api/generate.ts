import { request } from "./http.js"
import type { MainCharacterState, NPCState, StoryModules } from "../../../shared/types.js"
import type {
  GenerateChatResponse,
  GenerateCharacterAppearanceResponse,
  GenerateCharacterClothingResponse,
  GenerateCharacterContext,
  GenerateCharacterResponse,
  GenerateCharacterTraitsResponse,
  GenerateStoryResponse,
} from "../../../shared/api-types.js"

export const generate = {
  character: (description: string, storyModules?: StoryModules, requestId?: string) =>
    request<GenerateCharacterResponse>("/api/generate/character", {
      method: "POST",
      body: JSON.stringify({
        description,
        story_modules: storyModules,
        ...(requestId ? { request_id: requestId } : {}),
      }),
    }),
  characterAppearance: (context: GenerateCharacterContext, storyModules?: StoryModules, requestId?: string) =>
    request<GenerateCharacterAppearanceResponse>("/api/generate/character/part", {
      method: "POST",
      body: JSON.stringify({
        part: "appearance",
        context,
        story_modules: storyModules,
        ...(requestId ? { request_id: requestId } : {}),
      }),
    }),
  characterClothing: (context: GenerateCharacterContext, storyModules?: StoryModules, requestId?: string) =>
    request<GenerateCharacterClothingResponse>("/api/generate/character/part", {
      method: "POST",
      body: JSON.stringify({
        part: "clothing",
        context,
        story_modules: storyModules,
        ...(requestId ? { request_id: requestId } : {}),
      }),
    }),
  characterTraits: (context: GenerateCharacterContext, storyModules?: StoryModules, requestId?: string) =>
    request<GenerateCharacterTraitsResponse>("/api/generate/character/part", {
      method: "POST",
      body: JSON.stringify({
        part: "traits",
        context,
        story_modules: storyModules,
        ...(requestId ? { request_id: requestId } : {}),
      }),
    }),
  story: (
    description: string,
    character: Omit<MainCharacterState, "inventory">,
    storyModules?: StoryModules,
    requestId?: string,
  ) =>
    request<GenerateStoryResponse>("/api/generate/story", {
      method: "POST",
      body: JSON.stringify({
        description,
        character,
        story_modules: storyModules,
        ...(requestId ? { request_id: requestId } : {}),
      }),
    }),
  chat: (description: string, requestId?: string) =>
    request<GenerateChatResponse>("/api/generate/chat", {
      method: "POST",
      body: JSON.stringify({ description, ...(requestId ? { request_id: requestId } : {}) }),
    }),
}

export type { MainCharacterState, NPCState, StoryModules }
