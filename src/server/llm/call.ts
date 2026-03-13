import OpenAI from "openai"
import { buildJsonSchemaResponseFormat, derefJsonSchema, zodSchemaToJsonSchema } from "../utils/json-schema.js"
import { buildNpcCreationSchema } from "../schemas/npc-creation.js"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "../schemas/story-modules.js"
import { type NPCState, type NPCCreation, type StoryModules, type TurnResponse } from "../core/models.js"
import { buildTurnResponseSchema } from "./schema.js"
import { buildSamplingParams } from "./sampling.js"
import { parseJsonFromContent } from "./parse.js"
import { createLlmLogBase, logLlmEntry } from "./logging.js"
import { getClient, getConnector, getGenerationParams } from "./client.js"

function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (!value || typeof value !== "object") return false
  return typeof (value as Record<string | symbol, unknown>)[Symbol.asyncIterator] === "function"
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function extractErrorMessage(value: unknown): string | null {
  const obj = asRecord(value)
  if (!obj) return null
  const err = obj.error
  const errObj = asRecord(err)
  const msg = errObj ? errObj.message : null
  return typeof msg === "string" && msg.trim() ? msg.trim() : null
}

function extractContentFromChoices(value: unknown): string | null {
  const obj = asRecord(value)
  if (!obj) return null
  const choices = obj.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = asRecord(choices[0])
  if (!first) return null

  const message = asRecord(first.message)
  const msgContent = message?.content
  if (typeof msgContent === "string" && msgContent) return msgContent
  if (Array.isArray(msgContent)) {
    const parts = msgContent
      .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
      .filter((p): p is Record<string, unknown> => !!p)
    const textParts = parts
      .map((p) => {
        const type = p.type
        if (type === "text" && typeof p.text === "string") return p.text
        return null
      })
      .filter((t): t is string => typeof t === "string" && t.length > 0)
    const joined = textParts.join("")
    if (joined) return joined
  }

  const delta = asRecord(first.delta)
  const deltaContent = delta?.content
  if (typeof deltaContent === "string" && deltaContent) return deltaContent
  if (Array.isArray(deltaContent)) {
    const parts = deltaContent
      .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
      .filter((p): p is Record<string, unknown> => !!p)
    const textParts = parts
      .map((p) => {
        const type = p.type
        if (type === "text" && typeof p.text === "string") return p.text
        return null
      })
      .filter((t): t is string => typeof t === "string" && t.length > 0)
    const joined = textParts.join("")
    if (joined) return joined
  }

  const text = first.text
  if (typeof text === "string" && text) return text

  return null
}

function repairTurnResponseShape(value: unknown): unknown {
  if (!value || typeof value !== "object") return value
  const root = value as Record<string, unknown>

  // Remove invalid fields at root level that LLMs sometimes hallucinate
  delete root.location
  delete root.inventory_changes
  delete root.flags
  delete root.environment_changes

  const wsu = root.world_state_update
  if (!wsu || typeof wsu !== "object") {
    root.world_state_update = {}
  } else {
    const wsuObj = wsu as Record<string, unknown>
    
    // Move npc_changes and npc_introductions from world_state_update to root
    if (wsuObj.npc_changes !== undefined && root.npc_changes === undefined) {
      root.npc_changes = wsuObj.npc_changes
      delete wsuObj.npc_changes
    }
    if (wsuObj.npc_introductions !== undefined && root.npc_introductions === undefined) {
      root.npc_introductions = wsuObj.npc_introductions
      delete wsuObj.npc_introductions
    }
    
    // Fix common field name mismatches
    if (wsuObj.location !== undefined && wsuObj.current_scene === undefined) {
      wsuObj.current_scene = wsuObj.location
      delete wsuObj.location
    }
    if (wsuObj.time !== undefined && wsuObj.time_of_day === undefined) {
      wsuObj.time_of_day = wsuObj.time
      delete wsuObj.time
    }
    
    // Remove invalid fields that LLMs sometimes hallucinate
    delete wsuObj.environment_changes
    delete wsuObj.inventory_changes
    delete wsuObj.flags
  }

  return root
}

async function readStreamedContent(stream: AsyncIterable<unknown>): Promise<string> {
  let out = ""
  for await (const chunk of stream) {
    if (!chunk || typeof chunk !== "object") continue
    const choices = (chunk as Record<string, unknown>).choices
    if (!Array.isArray(choices) || choices.length === 0) continue
    const first = choices[0] as Record<string, unknown>
    const delta = first.delta as Record<string, unknown> | undefined
    const deltaContent = delta?.content
    if (typeof deltaContent === "string" && deltaContent) out += deltaContent
    const message = first.message as Record<string, unknown> | undefined
    const msgContent = message?.content
    if (typeof msgContent === "string" && msgContent) out += msgContent
  }
  return out
}

type ResponseLike = {
  json?: () => Promise<unknown>
  text?: () => Promise<string>
  status?: unknown
  ok?: unknown
}

function isResponseLike(value: unknown): value is ResponseLike {
  const obj = asRecord(value)
  if (!obj) return false
  return typeof obj.json === "function" || typeof obj.text === "function"
}

function describeResponseShape(value: unknown): string {
  if (!value) return String(value)
  if (typeof value !== "object") return typeof value
  const obj = value as Record<string, unknown>
  const ctor = (value as { constructor?: { name?: unknown } }).constructor?.name
  const keys = Object.keys(obj).slice(0, 40)
  return JSON.stringify({ ctor: typeof ctor === "string" ? ctor : undefined, keys })
}

type ReadableStreamLike = {
  getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }>; releaseLock?: () => void }
}

function isReadableStreamLike(value: unknown): value is ReadableStreamLike {
  const obj = asRecord(value)
  return !!obj && typeof obj.getReader === "function"
}

async function readReadableStreamText(stream: ReadableStreamLike, limitBytes = 2_000_000): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ""
  let readBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      readBytes += value.byteLength
      if (readBytes > limitBytes) break
      out += decoder.decode(value, { stream: true })
    }
    out += decoder.decode()
    return out
  } finally {
    reader.releaseLock?.()
  }
}

async function extractContentFromUnknown(res: unknown): Promise<string | null> {
  if (isAsyncIterable(res)) return await readStreamedContent(res)

  const errMsg = extractErrorMessage(res)
  if (errMsg) throw new Error(`LLM returned error payload: ${errMsg}`)

  const direct = extractContentFromChoices(res)
  if (direct) return direct

  const obj = asRecord(res)
  if (obj) {
    const body = obj.body
    if (isReadableStreamLike(body)) {
      const text = await readReadableStreamText(body)
      if (text && text.trim()) return text
    }

    const data = obj.data
    const fromData = extractContentFromChoices(data)
    if (fromData) return fromData

    const result = obj.result
    const fromResult = extractContentFromChoices(result)
    if (fromResult) return fromResult
  }

  if (isResponseLike(res)) {
    try {
      const payload = typeof res.json === "function" ? await res.json() : null
      const fromJson = extractContentFromChoices(payload)
      if (fromJson) return fromJson
      const msg = extractErrorMessage(payload)
      if (msg) throw new Error(`LLM returned error payload: ${msg}`)
    } catch {
      // ignore, try text fallback
    }

    if (typeof res.text === "function") {
      const text = await res.text()
      if (text && text.trim()) return text
    }
  }

  if (isReadableStreamLike(res)) {
    const text = await readReadableStreamText(res)
    if (text && text.trim()) return text
  }

  return null
}

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
  const connector = getConnector()
  const sampling = buildSamplingParams(connector, gen, maxTokensOverride, options)
  const jsonSchema = derefJsonSchema(schema)
  const logBase = createLlmLogBase("json", messages, sampling, schemaName, undefined, jsonSchema)
  let responseContent: string | undefined

  const model = connector.type === "openrouter" ? connector.model : "local"

  try {
    const schemaDescriptions: Record<string, string> = {
      TurnResponse: "Game turn response with narrative text and state updates",
      NPCCreation: "NPC character creation data",
    }
    const responseFormat = buildJsonSchemaResponseFormat(schemaName, jsonSchema, {
      strict: connector.type === "openrouter",
      description: schemaDescriptions[schemaName],
    }) as OpenAI.ResponseFormatJSONSchema
    const baseReq: OpenAI.ChatCompletionCreateParams = {
      model,
      messages,
      ...sampling,
      stream: false,
    }

    const initialReq =
      connector.type === "koboldcpp"
        ? ({
            ...baseReq,
            response_format: responseFormat,
            // Ensure KoboldCpp applies schema-derived grammar even if response_format is ignored.
            json_schema: jsonSchema,
            grammar_lazy: false,
            grammar_triggers: [],
          } as OpenAI.ChatCompletionCreateParams & {
            json_schema: object
            grammar_lazy: boolean
            grammar_triggers: unknown[]
          })
        : ({
            ...baseReq,
            response_format: responseFormat,
          } as OpenAI.ChatCompletionCreateParams)

    let res: unknown
    try {
      res = await getClient().chat.completions.create(initialReq)
    } catch (err) {
      const msg = String(err)
      if (connector.type === "openrouter" && (msg.includes("response_format") || msg.includes("json_schema"))) {
        res = await getClient().chat.completions.create(baseReq)
      } else {
        throw err
      }
    }

    const shape = describeResponseShape(res)
    responseContent = (await extractContentFromUnknown(res)) ?? undefined

    if (!responseContent) throw new Error(`LLM returned empty response. Shape: ${shape}`)
    const parsedRaw = parseJsonFromContent(responseContent, schemaName)
    const parsed = (schemaName === "TurnResponse" ? repairTurnResponseShape(parsedRaw) : parsedRaw) as T
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
  const connector = getConnector()
  const sampling = buildSamplingParams(connector, gen, maxTokensOverride, options)
  const stop = options.stop && options.stop.length > 0 ? options.stop.slice(0, 4) : ["\n\n===", "\n==="]
  const logBase = createLlmLogBase("text", messages, sampling, undefined, stop)
  let responseContent: string | undefined

  try {
    const res = await getClient().chat.completions.create({
      model: connector.type === "openrouter" ? connector.model : "local",
      messages,
      ...sampling,
      stop,
    })

    const shape = describeResponseShape(res)
    responseContent = (await extractContentFromUnknown(res)) ?? undefined

    if (!responseContent) throw new Error(`LLM returned empty response. Shape: ${shape}`)
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
