import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import * as db from "../core/db.js"
import { CreateCharacterRequestSchema } from "../core/models.js"
import { generateCharacter, generateCharacterPart, generateChat, generateStory } from "../llm/index.js"
import { StoryModulesSchema } from "../schemas/story-modules.js"
import { createOrGetSession, publishComplete, publishError, publishPreview } from "../streaming/hub.js"

const generate = new Hono()
const inFlight = new Map<string, Promise<unknown>>()

generate.post(
  "/character",
  zValidator(
    "json",
    z.object({
      description: z.string().min(1),
      story_modules: StoryModulesSchema.optional(),
      request_id: z.string().min(1).optional(),
    }),
  ),
  async (c) => {
    const { description, story_modules, request_id } = c.req.valid("json")
    try {
      const defaults = db.getSettings().storyDefaults
      const requestId = request_id?.trim() || undefined
      if (requestId) {
        const cached = db.getRequestResult(requestId)
        if (cached) {
          if (cached.kind !== "generate.character") {
            return c.json({ error: `request_id already used for: ${cached.kind}` }, 409)
          }
          return c.json(JSON.parse(cached.response_json))
        }
        const inflight = inFlight.get(requestId)
        if (inflight) return c.json(await inflight)
      }
      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!requestId
      if (shouldStream && requestId) createOrGetSession(requestId, "generate.character")
      const task = generateCharacter(description, story_modules ?? defaults, {
        onPreviewPatch: shouldStream && requestId ? (patch) => publishPreview(requestId, patch) : undefined,
      })
      if (requestId) inFlight.set(requestId, task)
      try {
        const result = await task
        if (requestId) db.setRequestResult(requestId, "generate.character", result)
        if (shouldStream && requestId) publishComplete(requestId)
        return c.json(result)
      } finally {
        if (requestId) inFlight.delete(requestId)
      }
    } catch (err) {
      const requestId = request_id?.trim() || undefined
      if (requestId && db.getSettings().streamingEnabled)
        publishError(requestId, err instanceof Error ? err.message : "Generation failed")
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

const characterContextSchema = z.object({
  name: z.string().default(""),
  race: z.string().default(""),
  gender: z.string().default(""),
  baseline_appearance: z.string().default(""),
  current_clothing: z.string().default(""),
  current_appearance: z.string().default(""),
  personality_traits: z.array(z.string()).default([]),
  major_flaws: z.array(z.string()).default([]),
  quirks: z.array(z.string()).default([]),
  perks: z.array(z.string()).default([]),
})

const generateStoryCharacterSchema = CreateCharacterRequestSchema

generate.post(
  "/character/part",
  zValidator(
    "json",
    z.object({
      part: z.enum(["appearance", "traits", "clothing"]),
      context: characterContextSchema,
      story_modules: StoryModulesSchema.optional(),
      request_id: z.string().min(1).optional(),
    }),
  ),
  async (c) => {
    const { part, context, story_modules, request_id } = c.req.valid("json")
    try {
      const defaults = db.getSettings().storyDefaults
      const modules = story_modules ?? defaults
      if ((part === "appearance" || part === "clothing") && !modules.character_appearance_clothing) {
        return c.json({ error: "Appearance/clothing generation is disabled by story modules." }, 400)
      }
      if (
        part === "traits" &&
        (!modules.character_personality_traits ||
          !modules.character_major_flaws ||
          !modules.character_quirks ||
          !modules.character_perks)
      ) {
        return c.json({ error: "Character trait generation is disabled by story modules." }, 400)
      }
      const requestId = request_id?.trim() || undefined
      if (requestId) {
        const cached = db.getRequestResult(requestId)
        if (cached) {
          if (cached.kind !== "generate.character.part") {
            return c.json({ error: `request_id already used for: ${cached.kind}` }, 409)
          }
          return c.json(JSON.parse(cached.response_json))
        }
        const inflight = inFlight.get(requestId)
        if (inflight) return c.json(await inflight)
      }
      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!requestId
      if (shouldStream && requestId) createOrGetSession(requestId, "generate.character")
      const task = generateCharacterPart(part, context, modules, {
        onPreviewPatch: shouldStream && requestId ? (patch) => publishPreview(requestId, patch) : undefined,
      })
      if (requestId) inFlight.set(requestId, task)
      try {
        const result = await task
        if (requestId) db.setRequestResult(requestId, "generate.character.part", result)
        if (shouldStream && requestId) publishComplete(requestId)
        return c.json(result)
      } finally {
        if (requestId) inFlight.delete(requestId)
      }
    } catch (err) {
      const requestId = request_id?.trim() || undefined
      if (requestId && db.getSettings().streamingEnabled)
        publishError(requestId, err instanceof Error ? err.message : "Generation failed")
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

generate.post(
  "/story",
  zValidator(
    "json",
    z.object({
      description: z.string().min(1),
      character: generateStoryCharacterSchema,
      story_modules: StoryModulesSchema.optional(),
      request_id: z.string().min(1).optional(),
    }),
  ),
  async (c) => {
    const { description, character, story_modules, request_id } = c.req.valid("json")
    try {
      const defaults = db.getSettings().storyDefaults
      const requestId = request_id?.trim() || undefined
      if (requestId) {
        const cached = db.getRequestResult(requestId)
        if (cached) {
          if (cached.kind !== "generate.story") {
            return c.json({ error: `request_id already used for: ${cached.kind}` }, 409)
          }
          return c.json(JSON.parse(cached.response_json))
        }
        const inflight = inFlight.get(requestId)
        if (inflight) return c.json(await inflight)
      }
      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!requestId
      if (shouldStream && requestId) createOrGetSession(requestId, "generate.story")
      const task = generateStory(description, character, story_modules ?? defaults, {
        onPreviewPatch: shouldStream && requestId ? (patch) => publishPreview(requestId, patch) : undefined,
      })
      if (requestId) inFlight.set(requestId, task)
      try {
        const result = await task
        if (requestId) db.setRequestResult(requestId, "generate.story", result)
        if (shouldStream && requestId) publishComplete(requestId)
        return c.json(result)
      } finally {
        if (requestId) inFlight.delete(requestId)
      }
    } catch (err) {
      const requestId = request_id?.trim() || undefined
      if (requestId && db.getSettings().streamingEnabled)
        publishError(requestId, err instanceof Error ? err.message : "Generation failed")
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

generate.post(
  "/chat",
  zValidator(
    "json",
    z.object({
      description: z.string().min(1),
      request_id: z.string().min(1).optional(),
    }),
  ),
  async (c) => {
    const { description, request_id } = c.req.valid("json")
    try {
      const requestId = request_id?.trim() || undefined
      if (requestId) {
        const cached = db.getRequestResult(requestId)
        if (cached) {
          if (cached.kind !== "generate.chat") {
            return c.json({ error: `request_id already used for: ${cached.kind}` }, 409)
          }
          return c.json(JSON.parse(cached.response_json))
        }
        const inflight = inFlight.get(requestId)
        if (inflight) return c.json(await inflight)
      }
      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!requestId
      if (shouldStream && requestId) createOrGetSession(requestId, "generate.chat")
      const task = generateChat(description, {
        onPreviewPatch: shouldStream && requestId ? (patch) => publishPreview(requestId, patch) : undefined,
      })
      if (requestId) inFlight.set(requestId, task)
      try {
        const result = await task
        if (requestId) db.setRequestResult(requestId, "generate.chat", result)
        if (shouldStream && requestId) publishComplete(requestId)
        return c.json(result)
      } finally {
        if (requestId) inFlight.delete(requestId)
      }
    } catch (err) {
      const requestId = request_id?.trim() || undefined
      if (requestId && db.getSettings().streamingEnabled)
        publishError(requestId, err instanceof Error ? err.message : "Generation failed")
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

export default generate
