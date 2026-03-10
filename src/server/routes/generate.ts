import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import { z } from "zod"
import { generateCharacter, generateCharacterPart, generateStory } from "../llm.js"

const generate = new Hono()

generate.post("/character", zValidator("json", z.object({ description: z.string().min(1) })), async (c) => {
  const { description } = c.req.valid("json")
  try {
    return c.json(await generateCharacter(description))
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
  }
})

const characterContextSchema = z.object({
  name: z.string().default(""),
  race: z.string().default(""),
  gender: z.string().default(""),
  appearance: z
    .object({
      physical_description: z.string().default(""),
      current_clothing: z.string().default(""),
    })
    .default({ physical_description: "", current_clothing: "" }),
  personality_traits: z.array(z.string()).default([]),
  custom_traits: z.array(z.string()).default([]),
})

generate.post(
  "/character/part",
  zValidator(
    "json",
    z.object({
      part: z.enum(["appearance", "traits", "clothing"]),
      context: characterContextSchema,
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
      description: z.string().min(1),
      character_name: z.string(),
      character_traits: z.array(z.string()),
    }),
  ),
  async (c) => {
    const { description, character_name, character_traits } = c.req.valid("json")
    try {
      return c.json(await generateStory(description, character_name, character_traits))
    } catch (err) {
      return c.json({ error: err instanceof Error ? err.message : "Generation failed" }, 500)
    }
  },
)

export default generate
