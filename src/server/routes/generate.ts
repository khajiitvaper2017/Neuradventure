import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { CreateCharacterRequestSchema } from "../models.js"
import { generateCharacter, generateCharacterPart, generateStory } from "../llm.js"
import { desc } from "../schemas/field-descriptions.js"

const generate = new Hono()

generate.post(
  "/character",
  zValidator(
    "json",
    z.object({
      description: z.string().min(1).describe(desc("requests.generate_character.description")),
    }),
  ),
  async (c) => {
    const { description } = c.req.valid("json")
    try {
      return c.json(await generateCharacter(description))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

const characterContextSchema = z.object({
  name: z.string().default("").describe(desc("requests.generate_character_context.name")),
  race: z.string().default("").describe(desc("requests.generate_character_context.race")),
  gender: z.string().default("").describe(desc("requests.generate_character_context.gender")),
  appearance: z
    .object({
      baseline_appearance: z.string().default("").describe(desc("state.appearance.baseline_appearance")),
      current_appearance: z.string().default("").describe(desc("state.appearance.current_appearance")),
      current_clothing: z.string().default("").describe(desc("state.appearance.current_clothing")),
    })
    .default({ baseline_appearance: "", current_appearance: "", current_clothing: "" })
    .describe(desc("requests.generate_character_context.appearance")),
  baseline_description: z
    .string()
    .default("")
    .describe(desc("requests.generate_character_context.baseline_description")),
  current_activity: z.string().default("").describe(desc("requests.generate_character_context.current_activity")),
  personality_traits: z
    .array(z.string())
    .default([])
    .describe(desc("requests.generate_character_context.personality_traits")),
  quirks: z.array(z.string()).default([]).describe(desc("requests.generate_character_context.quirks")),
  perks: z.array(z.string()).default([]).describe(desc("requests.generate_character_context.perks")),
  relationship_scores: z
    .array(
      z.object({
        name: z.string().default(""),
        affinity: z.number().int().default(0),
      }),
    )
    .default([])
    .describe(desc("requests.generate_character_context.relationship_scores")),
})

generate.post(
  "/character/part",
  zValidator(
    "json",
    z.object({
      part: z.enum(["appearance", "traits", "clothing"]).describe(desc("requests.generate_character_part.part")),
      context: characterContextSchema.describe(desc("requests.generate_character_part.context")),
    }),
  ),
  async (c) => {
    const { part, context } = c.req.valid("json")
    try {
      return c.json(await generateCharacterPart(part, context))
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
      character: CreateCharacterRequestSchema.describe(desc("requests.generate_story.character")),
    }),
  ),
  async (c) => {
    const { description, character } = c.req.valid("json")
    try {
      return c.json(await generateStory(description, character))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

export default generate
