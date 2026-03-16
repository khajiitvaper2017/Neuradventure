import { AppError } from "@/errors"
import * as db from "@/engine/core/db"
import { StoryModulesSchema } from "@/engine/schemas/story-modules"
import { createOrGetSession, publishComplete, publishError, publishPreview } from "@/engine/streaming/hub"
import { generateCharacter, generateCharacterPart, generateChat, generateStory } from "@/engine/llm"
import { clearInFlight, getCachedOrInFlight, setInFlight } from "@/services/requests/cache"
import { isProbablyOfflineError } from "@/services/requests/offline"
import type {
  GenerateChatResponse,
  GenerateCharacterAppearanceResponse,
  GenerateCharacterClothingResponse,
  GenerateCharacterContext,
  GenerateCharacterResponse,
  GenerateCharacterTraitsResponse,
  GenerateStoryResponse,
} from "@/shared/api-types"
import type { MainCharacterState, StoryModules } from "@/shared/types"

function asGenerateError(err: unknown): AppError {
  const message = err instanceof Error ? err.message : String(err)
  if (isProbablyOfflineError(err) || message.includes("ECONNREFUSED")) {
    return new AppError(
      503,
      "LLM request failed. Are you offline, is the LLM URL blocked by CORS, or is KoboldCpp not running?",
    )
  }
  return new AppError(500, message || "Generation failed")
}

export const generate = {
  character: async (
    description: string,
    storyModules?: StoryModules,
    requestId?: string,
  ): Promise<GenerateCharacterResponse> => {
    const defaults = db.getSettings().storyDefaults
    const trimmedRequestId = requestId?.trim() || undefined

    try {
      if (trimmedRequestId) {
        const existing = getCachedOrInFlight<GenerateCharacterResponse>(trimmedRequestId, "generate.character")
        if (existing.cached) return existing.cached
        if (existing.inflight) return await existing.inflight
      }

      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!trimmedRequestId
      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "generate.character")

      const task = generateCharacter(description, storyModules ?? defaults, {
        onPreviewPatch:
          shouldStream && trimmedRequestId ? (patch) => publishPreview(trimmedRequestId, patch) : undefined,
      })
      if (trimmedRequestId) setInFlight(trimmedRequestId, task)
      try {
        const result = await task
        if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "generate.character", result)
        if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
        return result
      } finally {
        if (trimmedRequestId) clearInFlight(trimmedRequestId)
      }
    } catch (err) {
      if (trimmedRequestId && db.getSettings().streamingEnabled)
        publishError(trimmedRequestId, err instanceof Error ? err.message : "Generation failed")
      throw asGenerateError(err)
    }
  },

  characterAppearance: async (
    context: GenerateCharacterContext,
    storyModules?: StoryModules,
    requestId?: string,
  ): Promise<GenerateCharacterAppearanceResponse> => {
    return generate.characterPart(
      "appearance",
      context,
      storyModules,
      requestId,
    ) as Promise<GenerateCharacterAppearanceResponse>
  },

  characterClothing: async (
    context: GenerateCharacterContext,
    storyModules?: StoryModules,
    requestId?: string,
  ): Promise<GenerateCharacterClothingResponse> => {
    return generate.characterPart(
      "clothing",
      context,
      storyModules,
      requestId,
    ) as Promise<GenerateCharacterClothingResponse>
  },

  characterTraits: async (
    context: GenerateCharacterContext,
    storyModules?: StoryModules,
    requestId?: string,
  ): Promise<GenerateCharacterTraitsResponse> => {
    return generate.characterPart(
      "traits",
      context,
      storyModules,
      requestId,
    ) as Promise<GenerateCharacterTraitsResponse>
  },

  characterPart: async (
    part: "appearance" | "traits" | "clothing",
    context: GenerateCharacterContext,
    storyModules?: StoryModules,
    requestId?: string,
  ): Promise<
    GenerateCharacterAppearanceResponse | GenerateCharacterTraitsResponse | GenerateCharacterClothingResponse
  > => {
    const defaults = db.getSettings().storyDefaults
    const modules = storyModules ?? defaults
    const safeModules = StoryModulesSchema.parse(modules)

    if ((part === "appearance" || part === "clothing") && !safeModules.character_appearance_clothing) {
      throw new AppError(400, "Appearance/clothing generation is disabled by story modules.")
    }
    if (
      part === "traits" &&
      (!safeModules.character_personality_traits || !safeModules.character_major_flaws || !safeModules.character_perks)
    ) {
      throw new AppError(400, "Character trait generation is disabled by story modules.")
    }

    const trimmedRequestId = requestId?.trim() || undefined
    try {
      if (trimmedRequestId) {
        const existing = getCachedOrInFlight<
          GenerateCharacterAppearanceResponse | GenerateCharacterTraitsResponse | GenerateCharacterClothingResponse
        >(trimmedRequestId, "generate.character.part")
        if (existing.cached) return existing.cached
        if (existing.inflight) return await existing.inflight
      }

      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!trimmedRequestId
      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "generate.character")

      const task = generateCharacterPart(part, context, safeModules, {
        onPreviewPatch:
          shouldStream && trimmedRequestId ? (patch) => publishPreview(trimmedRequestId, patch) : undefined,
      })
      if (trimmedRequestId) setInFlight(trimmedRequestId, task)
      try {
        const result = await task
        if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "generate.character.part", result)
        if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
        return result
      } finally {
        if (trimmedRequestId) clearInFlight(trimmedRequestId)
      }
    } catch (err) {
      if (trimmedRequestId && db.getSettings().streamingEnabled)
        publishError(trimmedRequestId, err instanceof Error ? err.message : "Generation failed")
      throw asGenerateError(err)
    }
  },

  story: async (
    description: string,
    character: Omit<MainCharacterState, "inventory">,
    storyModules?: StoryModules,
    requestId?: string,
  ): Promise<GenerateStoryResponse> => {
    const defaults = db.getSettings().storyDefaults
    const trimmedRequestId = requestId?.trim() || undefined

    try {
      if (trimmedRequestId) {
        const existing = getCachedOrInFlight<GenerateStoryResponse>(trimmedRequestId, "generate.story")
        if (existing.cached) return existing.cached
        if (existing.inflight) return await existing.inflight
      }

      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!trimmedRequestId
      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "generate.story")

      const task = generateStory(description, character, storyModules ?? defaults, {
        onPreviewPatch:
          shouldStream && trimmedRequestId ? (patch) => publishPreview(trimmedRequestId, patch) : undefined,
      })
      if (trimmedRequestId) setInFlight(trimmedRequestId, task)
      try {
        const result = await task
        if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "generate.story", result)
        if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
        return result as unknown as GenerateStoryResponse
      } finally {
        if (trimmedRequestId) clearInFlight(trimmedRequestId)
      }
    } catch (err) {
      if (trimmedRequestId && db.getSettings().streamingEnabled)
        publishError(trimmedRequestId, err instanceof Error ? err.message : "Generation failed")
      throw asGenerateError(err)
    }
  },

  chat: async (description: string, requestId?: string): Promise<GenerateChatResponse> => {
    const trimmedRequestId = requestId?.trim() || undefined

    try {
      if (trimmedRequestId) {
        const existing = getCachedOrInFlight<GenerateChatResponse>(trimmedRequestId, "generate.chat")
        if (existing.cached) return existing.cached
        if (existing.inflight) return await existing.inflight
      }

      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!trimmedRequestId
      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "generate.chat")

      const task = generateChat(description, {
        onPreviewPatch:
          shouldStream && trimmedRequestId ? (patch) => publishPreview(trimmedRequestId, patch) : undefined,
      })
      if (trimmedRequestId) setInFlight(trimmedRequestId, task)
      try {
        const result = await task
        if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "generate.chat", result)
        if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
        return result
      } finally {
        if (trimmedRequestId) clearInFlight(trimmedRequestId)
      }
    } catch (err) {
      if (trimmedRequestId && db.getSettings().streamingEnabled)
        publishError(trimmedRequestId, err instanceof Error ? err.message : "Generation failed")
      throw asGenerateError(err)
    }
  },
}
