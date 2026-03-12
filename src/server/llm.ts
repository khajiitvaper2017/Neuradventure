import OpenAI from "openai"
import { buildJsonSchemaResponseFormat, derefJsonSchema, zodSchemaToJsonSchema } from "./json-schema.js"
import {
  GenerateCharacterResponseSchema,
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateStoryResponseSchema,
  NPCCreationSchema,
  type MainCharacterState,
  type NPCState,
  type NPCCreation,
  type TurnResponse,
  type WorldState,
  type GenerateCharacterResponse,
  type GenerateCharacterAppearanceResponse,
  type GenerateCharacterClothingResponse,
  type GenerateCharacterTraitsResponse,
  type GenerateStoryResponse,
} from "./models.js"
import { type TurnRow } from "./db.js"
import { buildTurnResponseSchema } from "./llm/schema.js"
import { buildSamplingParams } from "./llm/sampling.js"
import { parseJsonFromContent } from "./llm/parse.js"
import { getClient, getGenerationParams, getConnector } from "./llm/client.js"
import { getConfig, npcTraits } from "./llm/config.js"
import { buildTurnMessages, buildNpcCreationMessages, buildImpersonateMessages } from "./llm/context.js"

export { buildTurnMessages, buildNpcCreationMessages, buildImpersonateMessages } from "./llm/context.js"
export { getCtxLimit, getCtxLimitCached, initCtxLimit } from "./llm/client.js"

export async function callLLM(
  messages: OpenAI.ChatCompletionMessageParam[],
  knownNpcs: NPCState[] = [],
): Promise<TurnResponse> {
  const turnSchema = buildTurnResponseSchema(knownNpcs)
  const schema = zodSchemaToJsonSchema(turnSchema, "TurnResponse")
  const result = await callLLMRaw<unknown>(messages, "TurnResponse", schema)
  return turnSchema.parse(result)
}

export async function generateNpcCreation(
  messages: OpenAI.ChatCompletionMessageParam[],
  forcedName?: string,
): Promise<NPCCreation> {
  const creationSchema = NPCCreationSchema
  const schema = zodSchemaToJsonSchema(creationSchema, "NPCCreation")
  const result = await callLLMRaw<unknown>(messages, "NPCCreation", schema)
  const parsed = creationSchema.parse(result)
  return forcedName ? { ...parsed, name: forcedName } : parsed
}

async function callLLMRaw<T>(
  messages: OpenAI.ChatCompletionMessageParam[],
  schemaName: string,
  schema: object,
  maxTokensOverride?: number,
  options: { disableRepetition?: boolean } = {},
): Promise<T> {
  const gen = getGenerationParams()
  const sampling = buildSamplingParams(gen, maxTokensOverride, options)
  const jsonSchema = derefJsonSchema(schema)

  const res = await getClient().chat.completions.create({
    model: "local",
    messages,
    ...sampling,
    stream: false,
    response_format: buildJsonSchemaResponseFormat(schemaName, jsonSchema) as OpenAI.ResponseFormatJSONSchema,
    // Ensure KoboldCpp applies schema-derived grammar even if response_format is ignored.
    json_schema: jsonSchema,
    grammar_lazy: false,
    grammar_triggers: [],
  } as OpenAI.ChatCompletionCreateParams & { json_schema: object; grammar_lazy: boolean; grammar_triggers: unknown[] })
  if (!("choices" in res)) {
    throw new Error("LLM returned a streamed response unexpectedly")
  }
  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("LLM returned empty response")
  return parseJsonFromContent(content, schemaName) as T
}

async function callLLMText(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokensOverride?: number,
  options: { disableRepetition?: boolean; stop?: string[] } = {},
): Promise<string> {
  const gen = getGenerationParams()
  const sampling = buildSamplingParams(gen, maxTokensOverride, options)
  const stop = options.stop && options.stop.length > 0 ? options.stop : ["\n\n===", "\n==="]

  const res = await getClient().chat.completions.create({
    model: "local",
    messages,
    ...sampling,
    stop,
  })
  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("LLM returned empty response")
  return content
}

function sanitizePlayerAction(text: string): string {
  let value = text.trim()
  value = value.replace(/^===\s*PLAYER'S ACTION\s*===\s*/i, "")
  value = value.replace(/^Player action:\s*/i, "")
  const markerIndex = value.search(/\n\s*===\s+/)
  if (markerIndex >= 0) value = value.slice(0, markerIndex)
  return value.trim()
}

export async function generatePlayerAction(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  actionMode: string,
  initialCharacter?: MainCharacterState,
  ctxLimitOverride?: number,
  authorNote?: { text: string; depth: number } | null,
): Promise<string> {
  const messages = buildImpersonateMessages(
    character,
    world,
    npcs,
    recentTurns,
    actionMode,
    initialCharacter,
    ctxLimitOverride,
    authorNote,
  )
  const maxTokens = Math.min(getGenerationParams().max_tokens, 160)
  const raw = await callLLMText(messages, maxTokens, { disableRepetition: true, stop: ["\n"] })
  return sanitizePlayerAction(raw)
}

export async function generateCharacter(description: string): Promise<GenerateCharacterResponse> {
  const schema = zodSchemaToJsonSchema(GenerateCharacterResponseSchema, "GenerateCharacterResponse")
  const result = await callLLMRaw<unknown>(
    [
      {
        role: "system",
        content: getConfig().generateCharacterPrompt.join("\n") + `\n\nAvailable personality traits: ${npcTraits.join(", ")}`,
      },
      { role: "user", content: `Create a character based on this description: "${description}"` },
    ],
    "GenerateCharacterResponse",
    schema,
    undefined,
    { disableRepetition: true },
  )
  return GenerateCharacterResponseSchema.parse(result)
}

type CharacterGenerationContext = {
  name: string
  race: string
  gender: string
  appearance: {
    baseline_appearance: string
    current_appearance: string
    current_clothing: string
  }
  personality_traits: string[]
  major_flaws: string[]
  quirks: string[]
  perks: string[]
}

function formatCharacterContext(
  context: CharacterGenerationContext,
  part: "appearance" | "traits" | "clothing",
): string {
  const lines = [
    `Name: ${context.name || "Unknown"}`,
    `Race: ${context.race || "Unknown"}`,
    `Gender: ${context.gender || "Unknown"}`,
  ]

  if (part === "traits") {
    const appearance = [
      context.appearance.baseline_appearance,
      context.appearance.current_appearance,
      context.appearance.current_clothing,
    ]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(" | ")
    lines.push(`Appearance: ${appearance || "Unknown"}`)
  } else if (part === "appearance") {
    lines.push(`Personality traits: ${context.personality_traits.join(", ") || "Unknown"}`)
    lines.push(`Major flaws: ${context.major_flaws.join(", ") || "None"}`)
    lines.push(`Quirks: ${context.quirks.join(", ") || "None"}`)
    lines.push(`Perks: ${context.perks.join(", ") || "None"}`)
  } else {
    lines.push(`Baseline appearance: ${context.appearance.baseline_appearance.trim() || "Unknown"}`)
    lines.push(`Current appearance: ${context.appearance.current_appearance.trim() || "Unknown"}`)
    lines.push(`Personality traits: ${context.personality_traits.join(", ") || "Unknown"}`)
    lines.push(`Major flaws: ${context.major_flaws.join(", ") || "None"}`)
    lines.push(`Quirks: ${context.quirks.join(", ") || "None"}`)
    lines.push(`Perks: ${context.perks.join(", ") || "None"}`)
  }

  return lines.join("\n")
}

export async function generateCharacterPart(
  part: "appearance" | "traits" | "clothing",
  context: CharacterGenerationContext,
): Promise<GenerateCharacterAppearanceResponse | GenerateCharacterTraitsResponse | GenerateCharacterClothingResponse> {
  const schema =
    part === "appearance"
      ? zodSchemaToJsonSchema(GenerateCharacterAppearanceResponseSchema, "GenerateCharacterAppearanceResponse")
      : part === "traits"
        ? zodSchemaToJsonSchema(GenerateCharacterTraitsResponseSchema, "GenerateCharacterTraitsResponse")
        : zodSchemaToJsonSchema(GenerateCharacterClothingResponseSchema, "GenerateCharacterClothingResponse")

  const config = getConfig()
  const partPrompt =
    part === "appearance"
      ? config.generateCharacterAppearancePrompt
      : part === "traits"
        ? config.generateCharacterTraitsPrompt
        : config.generateCharacterClothingPrompt
  const prompt = [partPrompt.join("\n"), `Available personality traits: ${npcTraits.join(", ")}`]
    .filter(Boolean)
    .join("\n\n")
  const userContent = [
    `Regenerate: ${part}`,
    "Character context:",
    formatCharacterContext(context, part),
    "Instruction: Use the context above to regenerate ONLY the requested section.",
    part === "appearance"
      ? "Do not reuse or paraphrase the current appearance. Keep it consistent with the identity and traits."
      : part === "traits"
        ? "Do not reuse the current personality traits, major flaws, quirks, or perks. Keep them consistent with the identity and appearance."
        : "Do not reuse or paraphrase the current clothing. Keep it consistent with the identity, appearance, and traits.",
  ].join("\n")

  const result = await callLLMRaw<unknown>(
    [
      { role: "system", content: prompt },
      { role: "user", content: userContent },
    ],
    part === "appearance"
      ? "GenerateCharacterAppearanceResponse"
      : part === "traits"
        ? "GenerateCharacterTraitsResponse"
        : "GenerateCharacterClothingResponse",
    schema,
    undefined,
    { disableRepetition: true },
  )

  return part === "appearance"
    ? GenerateCharacterAppearanceResponseSchema.parse(result)
    : part === "traits"
      ? GenerateCharacterTraitsResponseSchema.parse(result)
      : GenerateCharacterClothingResponseSchema.parse(result)
}

export async function generateStory(
  description: string,
  character: {
    name: string
    race: string
    gender: string
    current_location?: string
    appearance: { baseline_appearance: string; current_appearance: string; current_clothing: string }
    personality_traits: string[]
    major_flaws: string[]
    quirks: string[]
    perks: string[]
  },
): Promise<GenerateStoryResponse> {
  const schema = zodSchemaToJsonSchema(GenerateStoryResponseSchema, "GenerateStoryResponse")
  const traits = [...character.personality_traits, ...character.quirks, ...character.perks]
    .map((t) => t.trim())
    .filter(Boolean)
  const baselineAppearance = character.appearance.baseline_appearance || "Unknown"
  const currentAppearance = character.appearance.current_appearance || baselineAppearance
  const majorFlaws = character.major_flaws?.map((t) => t.trim()).filter(Boolean) ?? []
  const result = await callLLMRaw<unknown>(
    [
      { role: "system", content: getConfig().generateStoryPrompt.join("\n") },
      {
        role: "user",
        content: [
          "Character:",
          `Name: ${character.name}`,
          `Race: ${character.race || "Unknown"}`,
          `Gender: ${character.gender || "Unknown"}`,
          `Baseline appearance: ${baselineAppearance}`,
          `Current appearance: ${currentAppearance}`,
          `Clothing: ${character.appearance.current_clothing || "Unknown"}`,
          `Major flaws: ${majorFlaws.length > 0 ? majorFlaws.join(", ") : "None"}`,
          `Traits: ${traits.length > 0 ? traits.join(", ") : "Unknown"}`,
          `Story description: "${description}"`,
        ].join("\n"),
      },
    ],
    "GenerateStoryResponse",
    schema,
    undefined,
    { disableRepetition: true },
  )
  return GenerateStoryResponseSchema.parse(result)
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = new OpenAI({ baseURL: getConnector().url, apiKey: getConnector().api_key })
    await client.models.list()
    return true
  } catch {
    return false
  }
}
