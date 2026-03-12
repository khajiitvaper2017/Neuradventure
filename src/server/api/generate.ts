import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import * as db from "../core/db.js"
import { CreateCharacterRequestSchema } from "../core/models.js"
import { generateCharacter, generateCharacterPart, generateChat, generateStory } from "../llm/index.js"
import { desc } from "../schemas/field-descriptions.js"
import { StoryModulesSchema } from "../schemas/story-modules.js"

const generate = new Hono()

generate.post(
  "/character",
  zValidator(
    "json",
    z.object({
      description: z.string().min(1).describe(desc("requests.generate_character.description")),
      story_modules: StoryModulesSchema.optional().describe(desc("requests.generate_character.story_modules")),
    }),
  ),
  async (c) => {
    const { description, story_modules } = c.req.valid("json")
    try {
      const defaults = db.getSettings().storyDefaults
      return c.json(await generateCharacter(description, story_modules ?? defaults))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

const characterContextSchema = z.object({
  name: z.string().default("").describe(desc("state.character.name")),
  race: z.string().default("").describe(desc("state.character.race")),
  gender: z.string().default("").describe(desc("state.character.gender")),
  appearance: z
    .object({
      baseline_appearance: z.string().default("").describe(desc("state.appearance.baseline_appearance")),
      current_appearance: z.string().default("").describe(desc("state.appearance.current_appearance")),
      current_clothing: z.string().default("").describe(desc("state.appearance.current_clothing")),
    })
    .default({ baseline_appearance: "", current_appearance: "", current_clothing: "" })
    .describe(desc("state.character.appearance")),
  personality_traits: z.array(z.string()).default([]).describe(desc("traits.personality_traits")),
  major_flaws: z.array(z.string()).default([]).describe(desc("traits.major_flaws")),
  quirks: z.array(z.string()).default([]).describe(desc("traits.quirks")),
  perks: z.array(z.string()).default([]).describe(desc("traits.perks")),
})

const generateStoryCharacterSchema = CreateCharacterRequestSchema

generate.post(
  "/character/part",
  zValidator(
    "json",
    z.object({
      part: z.enum(["appearance", "traits", "clothing"]).describe(desc("requests.generate_character_part.part")),
      context: characterContextSchema.describe(desc("requests.generate_character_part.context")),
      story_modules: StoryModulesSchema.optional().describe(desc("requests.generate_character_part.story_modules")),
    }),
  ),
  async (c) => {
    const { part, context, story_modules } = c.req.valid("json")
    try {
      const defaults = db.getSettings().storyDefaults
      const modules = story_modules ?? defaults
      if (modules.character_detail_mode === "general") {
        return c.json({ error: "Character part generation is disabled in general mode." }, 400)
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
      return c.json(await generateCharacterPart(part, context, modules))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

generate.post(
  "/story",
  zValidator(
    "json",
    z.object({
      description: z.string().min(1).describe(desc("requests.generate_story.description")),
      character: generateStoryCharacterSchema.describe(desc("requests.generate_story.character")),
      story_modules: StoryModulesSchema.optional().describe(desc("requests.generate_story.story_modules")),
    }),
  ),
  async (c) => {
    const { description, character, story_modules } = c.req.valid("json")
    try {
      const defaults = db.getSettings().storyDefaults
      return c.json(await generateStory(description, character, story_modules ?? defaults))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

generate.post(
  "/chat",
  zValidator(
    "json",
    z.object({
      description: z.string().min(1).describe(desc("requests.generate_chat.description")),
    }),
  ),
  async (c) => {
    const { description } = c.req.valid("json")
    try {
      return c.json(await generateChat(description))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

export default generate
