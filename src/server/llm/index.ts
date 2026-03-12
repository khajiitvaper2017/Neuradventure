import OpenAI from "openai"
import { buildJsonSchemaResponseFormat, derefJsonSchema, zodSchemaToJsonSchema } from "../utils/json-schema.js"
import {
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateChatResponseSchema,
  buildGenerateCharacterResponseSchema,
  buildStoryResponseSchema,
  type MainCharacterState,
  type NPCState,
  type NPCCreation,
  type StoryModules,
  type TurnResponse,
  type WorldState,
  type GenerateCharacterResponse,
  type GenerateCharacterAppearanceResponse,
  type GenerateCharacterClothingResponse,
  type GenerateCharacterTraitsResponse,
  type GenerateChatResponse,
  type StoryResponse,
} from "../core/models.js"
import { type TurnRow } from "../core/db.js"
import { buildTurnResponseSchema } from "./schema.js"
import { buildSamplingParams } from "./sampling.js"
import { parseJsonFromContent } from "./parse.js"
import { createLlmLogBase, logLlmEntry } from "./logging.js"
import { getClient, getGenerationParams, getConnector } from "./client.js"
import { getGenerateCharacterPrompt, getGenerateChatPrompt, getGenerateStoryPrompt, npcTraits } from "./config.js"
import { buildImpersonateMessages } from "./context.js"
import { formatTemplate, getLlmStrings, getServerDefaults } from "../core/strings.js"
import { buildNpcCreationSchema } from "../schemas/npc-creation.js"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "../schemas/story-modules.js"

export { buildTurnMessages, buildNpcCreationMessages, buildImpersonateMessages } from "./context.js"
export { getCtxLimit, getCtxLimitCached, initCtxLimit } from "./client.js"

export async function callLLM(
  messages: OpenAI.ChatCompletionMessageParam[],
  knownNpcs: NPCState[] = [],
  storyModules?: StoryModules,
): Promise<TurnResponse> {
  const turnSchema = buildTurnResponseSchema(knownNpcs, storyModules)
  const schema = zodSchemaToJsonSchema(turnSchema, "TurnResponse")
  const result = await callLLMRaw<unknown>(messages, "TurnResponse", schema)
  return turnSchema.parse(result)
}

export async function generateNpcCreation(
  messages: OpenAI.ChatCompletionMessageParam[],
  forcedName?: string,
  storyModules?: StoryModules,
): Promise<NPCCreation> {
  const modules = storyModules ?? DEFAULT_STORY_MODULES
  const flags = resolveModuleFlags(modules)
  const creationSchema = buildNpcCreationSchema({
    useNpcAppearance: flags.useNpcAppearance,
    useNpcPersonalityTraits: flags.useNpcPersonalityTraits,
    useNpcMajorFlaws: flags.useNpcMajorFlaws,
    useNpcQuirks: flags.useNpcQuirks,
    useNpcPerks: flags.useNpcPerks,
    useNpcLocation: flags.useNpcLocation,
    useNpcActivity: flags.useNpcActivity,
  })
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
  const logBase = createLlmLogBase("json", messages, sampling, schemaName)
  let responseContent: string | undefined

  try {
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
    } as OpenAI.ChatCompletionCreateParams & {
      json_schema: object
      grammar_lazy: boolean
      grammar_triggers: unknown[]
    })
    if (!("choices" in res)) {
      throw new Error("LLM returned a streamed response unexpectedly")
    }
    responseContent = res.choices[0]?.message?.content ?? undefined
    if (!responseContent) throw new Error("LLM returned empty response")
    const parsed = parseJsonFromContent(responseContent, schemaName) as T
    logLlmEntry({
      ...logBase,
      response: {
        content: responseContent,
        parsed,
      },
    })
    return parsed
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    logLlmEntry({
      ...logBase,
      response: responseContent ? { content: responseContent } : undefined,
      error: err instanceof Error ? { message, stack: err.stack } : { message },
    })
    throw err
  }
}

async function callLLMText(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokensOverride?: number,
  options: { disableRepetition?: boolean; stop?: string[] } = {},
): Promise<string> {
  const gen = getGenerationParams()
  const sampling = buildSamplingParams(gen, maxTokensOverride, options)
  const stop = options.stop && options.stop.length > 0 ? options.stop : ["\n\n===", "\n==="]
  const logBase = createLlmLogBase("text", messages, sampling, undefined, stop)
  let responseContent: string | undefined

  try {
    const res = await getClient().chat.completions.create({
      model: "local",
      messages,
      ...sampling,
      stop,
    })
    responseContent = res.choices[0]?.message?.content ?? undefined
    if (!responseContent) throw new Error("LLM returned empty response")
    logLlmEntry({
      ...logBase,
      response: { content: responseContent },
    })
    return responseContent
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    logLlmEntry({
      ...logBase,
      response: responseContent ? { content: responseContent } : undefined,
      error: err instanceof Error ? { message, stack: err.stack } : { message },
    })
    throw err
  }
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
  storyModules?: StoryModules,
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
    storyModules,
  )
  const maxTokens = Math.min(getGenerationParams().max_tokens, 160)
  const raw = await callLLMText(messages, maxTokens, { disableRepetition: true, stop: ["\n"] })
  return sanitizePlayerAction(raw)
}

export async function generateChatReply(
  messages: OpenAI.ChatCompletionMessageParam[],
  stopTokens: string[],
): Promise<string> {
  const cleanedStops = stopTokens.filter((token) => token.trim().length > 0)
  return callLLMText(messages, undefined, { disableRepetition: true, stop: cleanedStops })
}

export async function generateCharacter(
  description: string,
  storyModules?: StoryModules,
): Promise<GenerateCharacterResponse> {
  const modules = storyModules ?? DEFAULT_STORY_MODULES
  const responseSchema = buildGenerateCharacterResponseSchema(modules)
  const schema = zodSchemaToJsonSchema(responseSchema, "GenerateCharacterResponse")
  const llmStrings = getLlmStrings()
  const availableTraitsLine = formatTemplate(llmStrings.generateCharacter.availableTraitsLine, {
    npcTraits: npcTraits.join(", "),
  })
  const prompt = getGenerateCharacterPrompt(modules)
  const result = await callLLMRaw<unknown>(
    [
      {
        role: "system",
        content: `${prompt}\n\n${availableTraitsLine}`,
      },
      {
        role: "user",
        content: formatTemplate(llmStrings.generateCharacter.userPrompt, { description }),
      },
    ],
    "GenerateCharacterResponse",
    schema,
    undefined,
    { disableRepetition: true },
  )
  return responseSchema.parse(result)
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
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const labels = llmStrings.characterContextLabels
  const unknown = defaults.unknown.value
  const noneTitle = defaults.format.noneTitle
  const lines = [
    formatTemplate(labels.name, { value: context.name || unknown }),
    formatTemplate(labels.race, { value: context.race || unknown }),
    formatTemplate(labels.gender, { value: context.gender || unknown }),
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
    lines.push(formatTemplate(labels.appearance, { value: appearance || unknown }))
  } else if (part === "appearance") {
    lines.push(formatTemplate(labels.personalityTraits, { value: context.personality_traits.join(", ") || unknown }))
    lines.push(formatTemplate(labels.majorFlaws, { value: context.major_flaws.join(", ") || noneTitle }))
    lines.push(formatTemplate(labels.quirks, { value: context.quirks.join(", ") || noneTitle }))
    lines.push(formatTemplate(labels.perks, { value: context.perks.join(", ") || noneTitle }))
  } else {
    lines.push(
      formatTemplate(labels.baselineAppearance, {
        value: context.appearance.baseline_appearance.trim() || unknown,
      }),
    )
    lines.push(
      formatTemplate(labels.currentAppearance, { value: context.appearance.current_appearance.trim() || unknown }),
    )
    lines.push(formatTemplate(labels.personalityTraits, { value: context.personality_traits.join(", ") || unknown }))
    lines.push(formatTemplate(labels.majorFlaws, { value: context.major_flaws.join(", ") || noneTitle }))
    lines.push(formatTemplate(labels.quirks, { value: context.quirks.join(", ") || noneTitle }))
    lines.push(formatTemplate(labels.perks, { value: context.perks.join(", ") || noneTitle }))
  }

  return lines.join("\n")
}

export async function generateCharacterPart(
  part: "appearance" | "traits" | "clothing",
  context: CharacterGenerationContext,
  storyModules?: StoryModules,
): Promise<GenerateCharacterAppearanceResponse | GenerateCharacterTraitsResponse | GenerateCharacterClothingResponse> {
  const schema =
    part === "appearance"
      ? zodSchemaToJsonSchema(GenerateCharacterAppearanceResponseSchema, "GenerateCharacterAppearanceResponse")
      : part === "traits"
        ? zodSchemaToJsonSchema(GenerateCharacterTraitsResponseSchema, "GenerateCharacterTraitsResponse")
        : zodSchemaToJsonSchema(GenerateCharacterClothingResponseSchema, "GenerateCharacterClothingResponse")

  const modules = storyModules ?? DEFAULT_STORY_MODULES
  const llmStrings = getLlmStrings()
  const availableTraitsLine = formatTemplate(llmStrings.generateCharacter.availableTraitsLine, {
    npcTraits: npcTraits.join(", "),
  })
  const prompt = [getGenerateCharacterPrompt(modules), availableTraitsLine].filter(Boolean).join("\n\n")
  const userContent = [
    formatTemplate(llmStrings.generateCharacterPart.regenerate, { part }),
    llmStrings.generateCharacterPart.contextHeader,
    formatCharacterContext(context, part),
    llmStrings.generateCharacterPart.instruction,
    part === "appearance"
      ? llmStrings.generateCharacterPart.avoid.appearance
      : part === "traits"
        ? llmStrings.generateCharacterPart.avoid.traits
        : llmStrings.generateCharacterPart.avoid.clothing,
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
    general_description?: string
    current_location?: string
    appearance?: { baseline_appearance: string; current_appearance: string; current_clothing: string }
    personality_traits?: string[]
    major_flaws?: string[]
    quirks?: string[]
    perks?: string[]
  },
  storyModules?: StoryModules,
): Promise<StoryResponse> {
  const modules = storyModules ?? DEFAULT_STORY_MODULES
  const flags = resolveModuleFlags(modules)
  const responseSchema = buildStoryResponseSchema(modules)
  const schema = zodSchemaToJsonSchema(responseSchema, "StoryResponse")
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const unknown = defaults.unknown.value
  const noneTitle = defaults.format.noneTitle
  const traits = [
    ...(flags.useCharPersonalityTraits ? (character.personality_traits ?? []) : []),
    ...(flags.useCharQuirks ? (character.quirks ?? []) : []),
    ...(flags.useCharPerks ? (character.perks ?? []) : []),
  ]
    .map((t) => t.trim())
    .filter(Boolean)
  const baselineAppearance = character.appearance?.baseline_appearance || unknown
  const currentAppearance = character.appearance?.current_appearance || baselineAppearance
  const majorFlaws = flags.useCharMajorFlaws ? (character.major_flaws?.map((t) => t.trim()).filter(Boolean) ?? []) : []
  const generalDescription = character.general_description?.trim() || defaults.unknown.generalDescription
  const useGeneral = modules.character_detail_mode === "general"
  const promptLines = getGenerateStoryPrompt(modules).split("\n")
  const result = await callLLMRaw<unknown>(
    [
      { role: "system", content: promptLines.join("\n") },
      {
        role: "user",
        content: [
          llmStrings.generateStory.characterHeader,
          formatTemplate(llmStrings.characterContextLabels.name, { value: character.name }),
          formatTemplate(llmStrings.characterContextLabels.race, { value: character.race || unknown }),
          formatTemplate(llmStrings.characterContextLabels.gender, { value: character.gender || unknown }),
          ...(useGeneral
            ? [formatTemplate(llmStrings.characterContextLabels.generalDescription, { value: generalDescription })]
            : [
                formatTemplate(llmStrings.characterContextLabels.baselineAppearance, { value: baselineAppearance }),
                formatTemplate(llmStrings.characterContextLabels.currentAppearance, { value: currentAppearance }),
                formatTemplate(llmStrings.characterContextLabels.clothing, {
                  value: character.appearance?.current_clothing || unknown,
                }),
              ]),
          ...(flags.useCharMajorFlaws
            ? [
                formatTemplate(llmStrings.characterContextLabels.majorFlaws, {
                  value: majorFlaws.length > 0 ? majorFlaws.join(", ") : noneTitle,
                }),
              ]
            : []),
          ...(flags.useCharPersonalityTraits || flags.useCharQuirks || flags.useCharPerks
            ? [
                formatTemplate(llmStrings.characterContextLabels.traits, {
                  value: traits.length > 0 ? traits.join(", ") : unknown,
                }),
              ]
            : []),
          formatTemplate(llmStrings.generateStory.storyDescription, { description }),
        ].join("\n"),
      },
    ],
    "StoryResponse",
    schema,
    undefined,
    { disableRepetition: true },
  )
  return responseSchema.parse(result)
}

export async function generateChat(description: string): Promise<GenerateChatResponse> {
  const schema = zodSchemaToJsonSchema(GenerateChatResponseSchema, "GenerateChatResponse")
  const prompt = getGenerateChatPrompt()
  const result = await callLLMRaw<unknown>(
    [
      { role: "system", content: prompt },
      { role: "user", content: description.trim() },
    ],
    "GenerateChatResponse",
    schema,
    undefined,
    { disableRepetition: true },
  )
  return GenerateChatResponseSchema.parse(result)
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
