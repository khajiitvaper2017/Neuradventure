import OpenAI from "openai"
import { buildJsonSchemaResponseFormat, derefJsonSchema, zodSchemaToJsonSchema } from "../utils/json-schema.js"
import { buildNpcCreationSchema } from "../schemas/npc-creation.js"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "../schemas/story-modules.js"
import { type NPCState, type NPCCreation, type StoryModules, type TurnResponse } from "../core/models.js"
import { buildTurnResponseSchema } from "./schema.js"
import { buildSamplingParams } from "./sampling.js"
import { parseJsonFromContent } from "./parse.js"
import { createLlmLogBase, logLlmEntry } from "./logging.js"
import { getClient, getGenerationParams } from "./client.js"

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

export async function callLLMRaw<T>(
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

export async function callLLMText(
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
