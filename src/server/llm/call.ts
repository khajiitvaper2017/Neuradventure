import OpenAI from "openai"
import { z } from "zod"
import { buildJsonSchemaResponseFormat, derefJsonSchema, zodSchemaToJsonSchema } from "../utils/json-schema.js"
import { buildNpcCreationSchema } from "../schemas/npc-creation.js"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "../schemas/story-modules.js"
import { type NPCState, type NPCCreation, type StoryModules, type TurnResponse } from "../core/models.js"
import { buildTurnResponseSchema } from "./schema.js"
import { buildSamplingParams } from "./sampling.js"
import { parseJsonFromContent } from "./parse.js"
import { createLlmLogBase, logLlmEntry } from "./logging.js"
import { getClient, getConnector, getGenerationParams, getCachedSupportedParameters } from "./client.js"
import { injectSchemaDescriptions } from "./inject-schema-descriptions.js"
import { createStructuredPreviewExtractor } from "./structured-preview.js"

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

  // Fix common field name mismatches
  if (root.backgroundEvents !== undefined && root.background_events === undefined) {
    root.background_events = root.backgroundEvents
    delete root.backgroundEvents
  }
  if (root.background_event !== undefined && root.background_events === undefined) {
    root.background_events = root.background_event
    delete root.background_event
  }

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
    if (wsuObj.background_events !== undefined && root.background_events === undefined) {
      root.background_events = wsuObj.background_events
      delete wsuObj.background_events
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

function extractTextDeltaFromContent(value: unknown): string {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return ""
  const parts = value
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
    .filter((p): p is Record<string, unknown> => !!p)
  const textParts = parts
    .map((p) => {
      const type = p.type
      if (type === "text" && typeof p.text === "string") return p.text
      return null
    })
    .filter((t): t is string => typeof t === "string" && t.length > 0)
  return textParts.join("")
}

function extractTextDeltaFromStreamChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return ""
  const choices = (chunk as Record<string, unknown>).choices
  if (!Array.isArray(choices) || choices.length === 0) return ""
  const first = (choices[0] ?? null) as Record<string, unknown> | null
  if (!first) return ""

  const delta = first.delta as Record<string, unknown> | undefined
  const deltaContent = delta?.content
  const deltaText = extractTextDeltaFromContent(deltaContent)
  if (deltaText) return deltaText

  const message = first.message as Record<string, unknown> | undefined
  const msgContent = message?.content
  return extractTextDeltaFromContent(msgContent)
}

async function readStreamedText(
  stream: AsyncIterable<unknown>,
  onDelta?: (delta: string, full: string) => void,
): Promise<string> {
  let out = ""
  for await (const chunk of stream) {
    const delta = extractTextDeltaFromStreamChunk(chunk)
    if (!delta) continue
    out += delta
    onDelta?.(delta, out)
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

function maybeLogOpenRouterResolvedModel(requestedModel: string, res: unknown): void {
  const root = asRecord(res)
  const model = root?.model
  const resolvedModel = typeof model === "string" && model.trim() ? model.trim() : null

  const provider = root?.provider
  const providerStr = typeof provider === "string" ? provider.trim() : null
  const providerObj = asRecord(provider)
  const providerName =
    providerStr ||
    (providerObj && typeof providerObj.name === "string" && providerObj.name.trim() ? providerObj.name.trim() : null) ||
    (providerObj && typeof providerObj.id === "string" && providerObj.id.trim() ? providerObj.id.trim() : null) ||
    null

  const shouldLog =
    (resolvedModel && resolvedModel !== requestedModel.trim()) || (providerName && providerName !== "") || false
  if (!shouldLog) return
  console.info(
    `[llm-openrouter] requested_model=${requestedModel}${resolvedModel ? ` resolved_model=${resolvedModel}` : ""}${providerName ? ` provider=${providerName}` : ""}`,
  )
}

function maybeLogOpenRouterSupportedParametersForSelection(
  model: string,
  request: Record<string, unknown>,
  schemaName: string,
  supportedParams: string[] | null,
): void {
  console.info(formatOpenRouterRoutingDiagnostics(request, schemaName, model, supportedParams))
}

function formatOpenRouterRoutingDiagnostics(
  request: Record<string, unknown>,
  schemaName: string,
  model: string,
  supportedParams: string[] | null,
): string {
  const safeKeys = Object.keys(request)
    .filter((k) => k !== "messages")
    .sort()

  const requestedKeys = safeKeys

  const provider = asRecord(request.provider)
  const requireParameters = provider ? provider.require_parameters : undefined

  const responseFormat = asRecord(request.response_format)
  const responseFormatType = responseFormat?.type
  const jsonSchema = responseFormat ? asRecord(responseFormat.json_schema) : null
  const jsonSchemaName = jsonSchema?.name
  const jsonSchemaStrict = jsonSchema?.strict

  const supportedParamSet = supportedParams && supportedParams.length > 0 ? new Set(supportedParams) : null
  const supportsStructuredOutputs = supportedParamSet ? supportedParamSet.has("structured_outputs") : null
  const supportsResponseFormat = supportedParamSet ? supportedParamSet.has("response_format") : null
  const supportedResponseFormats: string[] = []
  if (supportsResponseFormat === true) supportedResponseFormats.push("json_object")
  if (supportsResponseFormat === true && supportsStructuredOutputs === true)
    supportedResponseFormats.push("json_schema")

  const samplingKeys = [
    "max_completion_tokens",
    "max_tokens",
    "temperature",
    "top_p",
    "min_p",
    "top_k",
    "top_a",
    "seed",
    "presence_penalty",
    "frequency_penalty",
    "repetition_penalty",
  ] as const
  const samplingParts: string[] = []
  for (const key of samplingKeys) {
    const value = request[key]
    if (typeof value === "number" || typeof value === "boolean") samplingParts.push(`${key}=${value}`)
  }
  const logitBias = asRecord(request.logit_bias)
  if (logitBias) samplingParts.push(`logit_bias_keys=${Object.keys(logitBias).length}`)

  const notSupported =
    supportedParams && supportedParams.length > 0
      ? requestedKeys.filter((k) => k !== "model" && k !== "stream" && !supportedParams.includes(k))
      : []

  const parts: string[] = []
  parts.push(`[openrouter-routing] model=${model} schema=${schemaName}`)
  if (requireParameters !== undefined)
    parts.push(`[openrouter-routing] provider.require_parameters=${String(requireParameters)}`)
  if (responseFormatType || jsonSchemaName || jsonSchemaStrict !== undefined) {
    const strictStr = jsonSchemaStrict === undefined ? "unknown" : String(jsonSchemaStrict)
    parts.push(
      `[openrouter-routing] response_format=${String(responseFormatType)} json_schema.name=${String(
        jsonSchemaName,
      )} strict=${strictStr}`,
    )
  }
  parts.push(`[openrouter-routing] requested_keys=${requestedKeys.join(", ")}`)
  if (samplingParts.length > 0) parts.push(`[openrouter-routing] sampling=${samplingParts.join(", ")}`)
  if (supportedParams && supportedParams.length > 0) {
    parts.push(`[openrouter-routing] model_supported_parameters=${supportedParams.join(", ")}`)
    parts.push(
      `[openrouter-routing] supports_response_format=${String(supportsResponseFormat)} supports_structured_outputs=${String(
        supportsStructuredOutputs,
      )}`,
    )
    parts.push(
      `[openrouter-routing] supported_response_formats=${
        supportedResponseFormats.length > 0 ? supportedResponseFormats.join(", ") : "(none)"
      }`,
    )
  }
  if (notSupported.length > 0) {
    // Note: OpenRouter routing options like `provider` are not part of model supported_parameters.
    const filtered = notSupported.filter((k) => k !== "provider")
    if (filtered.length > 0) parts.push(`[openrouter-routing] keys_not_in_supported_parameters=${filtered.join(", ")}`)
  }

  if (responseFormatType === "json_schema" && supportsResponseFormat === true && supportsStructuredOutputs === false) {
    parts.push(
      `[openrouter-routing] hint=model_advertises_response_format_but_not_structured_outputs; json_schema may be unsupported for this model/provider`,
    )
  }
  return parts.join("\n")
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
  if (isAsyncIterable(res)) return await readStreamedText(res)

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

function formatZodIssues(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
    return `${path}: ${issue.message}`
  })
  return issues.join("; ")
}

function shouldRetryWithoutStream(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg) return false
  if (!/stream/i.test(msg)) return false
  return /(unknown|unrecognized|unsupported|unexpected|additional property|not allowed|invalid)/i.test(msg)
}

export async function callLLM(
  messages: OpenAI.ChatCompletionMessageParam[],
  knownNpcs: NPCState[] = [],
  storyModules?: StoryModules,
  options: { onPreviewPatch?: (patch: Record<string, unknown>) => void } = {},
): Promise<TurnResponse> {
  const turnSchema = buildTurnResponseSchema(knownNpcs, storyModules)
  const includeBackgroundEvents = !!storyModules?.track_background_events
  const previewKeys = includeBackgroundEvents
    ? ["narrative_text", "background_events", "current_scene", "time_of_day"]
    : ["narrative_text", "current_scene", "time_of_day"]
  return await callLLMRaw(messages, "TurnResponse", turnSchema, undefined, {
    ...options,
    previewKeys,
  })
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
  const parsed = await callLLMRaw(messages, "NPCCreation", creationSchema)
  return forcedName ? { ...parsed, name: forcedName } : parsed
}

export async function callLLMRaw<TSchema extends z.ZodTypeAny>(
  messages: OpenAI.ChatCompletionMessageParam[],
  schemaName: string,
  zodSchema: TSchema,
  maxTokensOverride?: number,
  options: {
    disableRepetition?: boolean
    onPreviewPatch?: (patch: Record<string, unknown>) => void
    previewKeys?: string[]
  } = {},
): Promise<z.infer<TSchema>> {
  const gen = getGenerationParams()
  const connector = getConnector()

  // Fetch supported parameters for OpenRouter to filter sampling params
  const supportedParams = connector.type === "openrouter" ? await getCachedSupportedParameters() : null
  const sampling = buildSamplingParams(connector, gen, maxTokensOverride, {
    ...options,
    ...(supportedParams ? { supportedParameters: supportedParams } : {}),
  })

  const schema = zodSchemaToJsonSchema(zodSchema, schemaName)
  const deref = derefJsonSchema(schema)
  const injected = injectSchemaDescriptions(schemaName, deref)
  const jsonSchema = injected.schema
  if (injected.missing.length > 0) {
    const sample = injected.missing.slice(0, 12).map((m) => m.path)
    console.warn(
      `[llm-schema] Missing descriptions for ${schemaName}: ${injected.missing.length} field(s). Examples: ${sample.join(
        ", ",
      )}`,
    )
  }
  const logBase = createLlmLogBase("json", schemaName, messages, sampling, schemaName, undefined, jsonSchema)
  let responseContent: string | undefined
  let parsedCandidate: unknown | undefined
  let requestPayload: Record<string, unknown> | undefined

  const model = connector.type === "openrouter" ? connector.model : "local"
  const shouldStream = typeof options.onPreviewPatch === "function"
  const previewKeys =
    options.previewKeys ??
    (schemaName === "TurnResponse"
      ? ["narrative_text", "background_events", "current_scene", "time_of_day"]
      : schemaName === "GenerateCharacterResponse"
        ? ["name", "race", "gender", "general_description", "baseline_appearance", "current_clothing"]
        : schemaName === "GenerateCharacterAppearanceResponse"
          ? ["baseline_appearance", "current_appearance"]
          : schemaName === "GenerateCharacterClothingResponse"
            ? ["current_clothing"]
            : schemaName === "StoryResponse"
              ? [
                  "title",
                  "opening_scenario",
                  "starting_location",
                  "starting_date",
                  "starting_time",
                  "general_description",
                  "current_appearance",
                ]
              : schemaName === "GenerateChatResponse"
                ? ["title", "greeting"]
                : [])
  const previewExtractor = shouldStream && previewKeys.length > 0 ? createStructuredPreviewExtractor(previewKeys) : null

  try {
    const schemaDescriptions: Record<string, string> = {
      TurnResponse: "Game turn response with narrative text and state updates",
      NPCCreation: "NPC character creation data",
    }

    const responseFormat = buildJsonSchemaResponseFormat(schemaName, jsonSchema, {
      // Always request strict mode; some backends may ignore it, but providers that
      // support JSON Schema should enforce it.
      strict: true,
      description: schemaDescriptions[schemaName],
    }) as OpenAI.ResponseFormatJSONSchema
    const baseReq: OpenAI.ChatCompletionCreateParams = {
      model,
      messages,
      ...sampling,
      stream: shouldStream,
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
      requestPayload = initialReq as unknown as Record<string, unknown>
      if (connector.type === "openrouter") {
        maybeLogOpenRouterSupportedParametersForSelection(model, requestPayload, schemaName, supportedParams)
      }
      res = await getClient().chat.completions.create(initialReq)
    } catch (err) {
      const msg = String(err)
      if (
        connector.type === "openrouter" &&
        err instanceof OpenAI.NotFoundError &&
        typeof err.error === "object" &&
        err.error !== null
      ) {
        const errObj = err.error as Record<string, unknown>
        const errMessage = typeof errObj.message === "string" ? errObj.message : ""
        if (!errMessage.includes("No endpoints found that can handle the requested parameters")) {
          throw err
        }
        const diagnostics = formatOpenRouterRoutingDiagnostics(
          initialReq as unknown as Record<string, unknown>,
          schemaName,
          model,
          supportedParams,
        )
        const orMessage = String(errMessage)
        throw new Error(`OpenRouter routing failed (404): ${orMessage}\n${diagnostics}`, {
          cause: err,
        })
      }
      if (
        connector.type === "koboldcpp" &&
        (msg.includes("response_format") || msg.includes("json_schema") || msg.includes("strict"))
      ) {
        // If the backend rejects `response_format`, fall back to grammar-only mode.
        // KoboldCpp should still honor `json_schema` via grammar conversion.
        const fallbackReq = { ...initialReq }
        delete (fallbackReq as unknown as Record<string, unknown>).response_format
        requestPayload = fallbackReq as unknown as Record<string, unknown>
        res = await getClient().chat.completions.create(fallbackReq as OpenAI.ChatCompletionCreateParams)
      } else if (shouldStream && shouldRetryWithoutStream(err)) {
        const fallbackReq = { ...initialReq, stream: false }
        requestPayload = fallbackReq as unknown as Record<string, unknown>
        res = await getClient().chat.completions.create(fallbackReq as OpenAI.ChatCompletionCreateParams)
      } else {
        throw err
      }
    }

    if (connector.type === "openrouter") maybeLogOpenRouterResolvedModel(model, res)

    const shape = describeResponseShape(res)
    if (shouldStream && previewExtractor && isAsyncIterable(res)) {
      try {
        responseContent = await readStreamedText(res, (delta) => {
          const patch = previewExtractor.push(delta)
          if (patch) options.onPreviewPatch?.(patch)
        })
      } catch (err) {
        if (!shouldRetryWithoutStream(err)) throw err
        const fallbackReq = { ...initialReq, stream: false } as OpenAI.ChatCompletionCreateParams
        requestPayload = fallbackReq as unknown as Record<string, unknown>
        const fallbackRes = await getClient().chat.completions.create(fallbackReq)
        responseContent = (await extractContentFromUnknown(fallbackRes)) ?? undefined
        if (responseContent) {
          const patch = previewExtractor.push(responseContent)
          if (patch) options.onPreviewPatch?.(patch)
        }
      }
    } else {
      responseContent = (await extractContentFromUnknown(res)) ?? undefined
      if (shouldStream && previewExtractor && responseContent) {
        const patch = previewExtractor.push(responseContent)
        if (patch) options.onPreviewPatch?.(patch)
      }
    }

    if (!responseContent) throw new Error(`LLM returned empty response. Shape: ${shape}`)
    const parsedRaw = parseJsonFromContent(responseContent, schemaName)
    parsedCandidate = schemaName === "TurnResponse" ? repairTurnResponseShape(parsedRaw) : parsedRaw

    const validated = zodSchema.safeParse(parsedCandidate)
    if (!validated.success) {
      const issues = formatZodIssues(validated.error)
      throw new Error(`LLM returned JSON that failed validation for ${schemaName}: ${issues}`)
    }

    const parsed = validated.data
    logLlmEntry({
      ...logBase,
      request: requestPayload,
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
      request: requestPayload,
      response: responseContent
        ? { content: responseContent, ...(parsedCandidate !== undefined ? { parsed: parsedCandidate } : {}) }
        : parsedCandidate !== undefined
          ? { parsed: parsedCandidate }
          : undefined,
      error: err instanceof Error ? { message, stack: err.stack } : { message },
    })
    throw err
  }
}

export async function callLLMText(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokensOverride?: number,
  options: {
    disableRepetition?: boolean
    stop?: string[]
    requestName?: string
    onText?: (text: string) => void
  } = {},
): Promise<string> {
  const gen = getGenerationParams()
  const connector = getConnector()

  // Fetch supported parameters for OpenRouter to filter sampling params
  const supportedParams = connector.type === "openrouter" ? await getCachedSupportedParameters() : null
  const sampling = buildSamplingParams(connector, gen, maxTokensOverride, {
    ...options,
    ...(supportedParams ? { supportedParameters: supportedParams } : {}),
  })

  const stop = options.stop && options.stop.length > 0 ? options.stop.slice(0, 4) : ["\n\n===", "\n==="]
  const requestName = options.requestName?.trim() || "Text"
  const logBase = createLlmLogBase("text", requestName, messages, sampling, undefined, stop)
  let responseContent: string | undefined
  let requestPayload: Record<string, unknown> | undefined
  const shouldStream = typeof options.onText === "function"

  try {
    const req: OpenAI.ChatCompletionCreateParams = {
      model: connector.type === "openrouter" ? connector.model : "local",
      messages,
      ...sampling,
      stop,
      stream: shouldStream,
    }
    requestPayload = req as unknown as Record<string, unknown>
    let res: unknown
    try {
      res = await getClient().chat.completions.create(req)
    } catch (err) {
      if (shouldStream && shouldRetryWithoutStream(err)) {
        const fallbackReq = { ...req, stream: false }
        requestPayload = fallbackReq as unknown as Record<string, unknown>
        res = await getClient().chat.completions.create(fallbackReq)
      } else {
        throw err
      }
    }

    const shape = describeResponseShape(res)
    if (shouldStream && isAsyncIterable(res)) {
      try {
        responseContent = await readStreamedText(res, (_delta, full) => {
          options.onText?.(full)
        })
      } catch (err) {
        if (!shouldRetryWithoutStream(err)) throw err
        const fallbackReq = { ...req, stream: false }
        requestPayload = fallbackReq as unknown as Record<string, unknown>
        const fallbackRes = await getClient().chat.completions.create(fallbackReq)
        responseContent = (await extractContentFromUnknown(fallbackRes)) ?? undefined
        if (responseContent) options.onText?.(responseContent)
      }
    } else {
      responseContent = (await extractContentFromUnknown(res)) ?? undefined
      if (shouldStream && responseContent) options.onText?.(responseContent)
    }

    if (!responseContent) throw new Error(`LLM returned empty response. Shape: ${shape}`)
    logLlmEntry({
      ...logBase,
      request: requestPayload,
      response: { content: responseContent },
    })
    return responseContent
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    logLlmEntry({
      ...logBase,
      request: requestPayload,
      response: responseContent ? { content: responseContent } : undefined,
      error: err instanceof Error ? { message, stack: err.stack } : { message },
    })
    throw err
  }
}
