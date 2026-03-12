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
} from "./types.js"

export const generate = {
  character: (description: string, storyModules?: StoryModules) =>
    request<GenerateCharacterResponse>("/api/generate/character", {
      method: "POST",
      body: JSON.stringify({ description, story_modules: storyModules }),
    }),
  characterAppearance: (context: GenerateCharacterContext, storyModules?: StoryModules) =>
    request<GenerateCharacterAppearanceResponse>("/api/generate/character/part", {
      method: "POST",
      body: JSON.stringify({ part: "appearance", context, story_modules: storyModules }),
    }),
  characterClothing: (context: GenerateCharacterContext, storyModules?: StoryModules) =>
    request<GenerateCharacterClothingResponse>("/api/generate/character/part", {
      method: "POST",
      body: JSON.stringify({ part: "clothing", context, story_modules: storyModules }),
    }),
  characterTraits: (context: GenerateCharacterContext, storyModules?: StoryModules) =>
    request<GenerateCharacterTraitsResponse>("/api/generate/character/part", {
      method: "POST",
      body: JSON.stringify({ part: "traits", context, story_modules: storyModules }),
    }),
  story: (description: string, character: Omit<MainCharacterState, "inventory">, storyModules?: StoryModules) =>
    request<GenerateStoryResponse>("/api/generate/story", {
      method: "POST",
      body: JSON.stringify({ description, character, story_modules: storyModules }),
    }),
  chat: (description: string) =>
    request<GenerateChatResponse>("/api/generate/chat", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),
}

export type { MainCharacterState, NPCState, StoryModules }
