import { z } from "zod"
import { buildJsonSchemaResponseFormat, derefJsonSchema, zodSchemaToJsonSchema } from "@/engine/utils/json-schema"
import { buildNpcCreationSchema } from "@/engine/schemas/npc-creation"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "@/engine/schemas/story-modules"
import { type NPCState, type NPCCreation, type StoryModules, type TurnResponse } from "@/engine/core/models"
import { buildTurnResponseSchema } from "@/engine/llm/schema"
import { buildSamplingParams } from "@/engine/llm/sampling"
import { parseJsonFromContent } from "@/engine/llm/parse"
import { createLlmLogBase, logLlmEntry } from "@/engine/llm/logging"
import { getCachedSupportedParameters, getClient, getConnector, getGenerationParams } from "@/engine/llm/client"
import { injectSchemaDescriptions } from "@/engine/llm/inject-schema-descriptions"
import { createStructuredPreviewExtractor } from "@/engine/llm/structured-preview"
import { injectOutputSchemaIntoMessages } from "@/engine/llm/schema-in-prompt"
import {
  describeResponseShape,
  extractContentFromUnknown,
  isAsyncIterable,
  readStreamedText,
  shouldRetryWithoutStream,
} from "@/engine/llm/response-extract"
import {
  extractOpenRouterNoEndpointMessage,
  formatOpenRouterRoutingDiagnostics,
  logOpenRouterJsonObjectFallback,
  maybeLogOpenRouterResolvedModel,
  maybeLogOpenRouterSupportedParametersForSelection,
  shortErrorForLog,
  shouldDropResponseFormat,
  shouldFallbackFromJsonSchema,
} from "@/engine/llm/openrouter-routing"
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ResponseFormatJSONSchema,
  ResponseFormatJSONObject,
} from "@/engine/llm/openai-types"

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

function formatZodIssues(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
    return `${path}: ${issue.message}`
  })
  return issues.join("; ")
}

export async function callLLM(
  messages: ChatCompletionMessageParam[],
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
  messages: ChatCompletionMessageParam[],
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
  messages: ChatCompletionMessageParam[],
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
  const supportedParamSet = supportedParams && supportedParams.length > 0 ? new Set(supportedParams) : null
  const supportsResponseFormat = supportedParamSet ? supportedParamSet.has("response_format") : null
  const supportsStructuredOutputs = supportedParamSet ? supportedParamSet.has("structured_outputs") : null
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
    }) as ResponseFormatJSONSchema

    const baseReq: ChatCompletionCreateParams = {
      model,
      messages,
      ...sampling,
      stream: shouldStream,
    }

    type OpenRouterMode = "json_schema" | "json_object" | "none"
    const buildOpenRouterReq = (mode: OpenRouterMode): ChatCompletionCreateParams => {
      const nextMessages =
        mode === "json_schema" ? messages : injectOutputSchemaIntoMessages(messages, schemaName, jsonSchema)
      const req: ChatCompletionCreateParams = { ...baseReq, messages: nextMessages }
      if (mode === "json_schema") {
        req.response_format = responseFormat
      } else if (mode === "json_object") {
        req.response_format = { type: "json_object" } as ResponseFormatJSONObject
      }
      return req
    }

    let openRouterMode: OpenRouterMode = "json_schema"
    if (connector.type === "openrouter" && supportsStructuredOutputs === false) {
      openRouterMode = supportsResponseFormat === false ? "none" : "json_object"
    }
    if (connector.type === "openrouter" && openRouterMode === "json_object") {
      logOpenRouterJsonObjectFallback(schemaName, model, "model_lacks_structured_outputs", {
        supports_response_format: supportsResponseFormat,
        supports_structured_outputs: supportsStructuredOutputs,
      })
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
          } as ChatCompletionCreateParams & {
            json_schema: object
            grammar_lazy: boolean
            grammar_triggers: unknown[]
          })
        : connector.type === "openrouter"
          ? buildOpenRouterReq(openRouterMode)
          : ({
              ...baseReq,
              response_format: responseFormat,
            } as ChatCompletionCreateParams)

    let res: unknown
    try {
      requestPayload = initialReq as unknown as Record<string, unknown>
      if (connector.type === "openrouter") {
        maybeLogOpenRouterSupportedParametersForSelection(model, requestPayload, schemaName, supportedParams)
      }
      res = await getClient().chat.completions.create(initialReq)
    } catch (err) {
      const msg = String(err)

      const openRouterNoEndpointMessage =
        connector.type === "openrouter" ? extractOpenRouterNoEndpointMessage(err) : null
      if (
        connector.type === "openrouter" &&
        openRouterMode === "json_schema" &&
        (shouldFallbackFromJsonSchema(err) || !!openRouterNoEndpointMessage)
      ) {
        const fallbackMode: OpenRouterMode = supportsResponseFormat === false ? "none" : "json_object"
        try {
          if (fallbackMode === "json_object") {
            logOpenRouterJsonObjectFallback(schemaName, model, "request_rejected_json_schema", {
              error: shortErrorForLog(err),
              supports_response_format: supportsResponseFormat,
              supports_structured_outputs: supportsStructuredOutputs,
            })
          }
          const fallbackReq = buildOpenRouterReq(fallbackMode)
          requestPayload = fallbackReq as unknown as Record<string, unknown>
          openRouterMode = fallbackMode
          res = await getClient().chat.completions.create(fallbackReq)
        } catch (err2) {
          if (fallbackMode === "json_object" && shouldDropResponseFormat(err2)) {
            console.info(
              `[llm-openrouter] fallback=drop_response_format_after_json_object schema=${schemaName} model=${model} error=${shortErrorForLog(err2)}`,
            )
            const fallbackReq2 = buildOpenRouterReq("none")
            requestPayload = fallbackReq2 as unknown as Record<string, unknown>
            openRouterMode = "none"
            res = await getClient().chat.completions.create(fallbackReq2)
          } else if (openRouterNoEndpointMessage) {
            const diagnostics = formatOpenRouterRoutingDiagnostics(
              initialReq as unknown as Record<string, unknown>,
              schemaName,
              model,
              supportedParams,
            )
            throw new Error(`OpenRouter routing failed (404): ${openRouterNoEndpointMessage}\n${diagnostics}`, {
              cause: err2 as unknown,
            })
          } else {
            throw err2
          }
        }
      } else if (connector.type === "openrouter" && openRouterMode === "json_object" && shouldDropResponseFormat(err)) {
        console.info(
          `[llm-openrouter] fallback=drop_response_format_after_json_object schema=${schemaName} model=${model} error=${shortErrorForLog(err)}`,
        )
        const fallbackReq = buildOpenRouterReq("none")
        requestPayload = fallbackReq as unknown as Record<string, unknown>
        openRouterMode = "none"
        res = await getClient().chat.completions.create(fallbackReq)
      } else if (openRouterNoEndpointMessage) {
        const diagnostics = formatOpenRouterRoutingDiagnostics(
          initialReq as unknown as Record<string, unknown>,
          schemaName,
          model,
          supportedParams,
        )
        throw new Error(`OpenRouter routing failed (404): ${openRouterNoEndpointMessage}\n${diagnostics}`, {
          cause: err as unknown,
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
        res = await getClient().chat.completions.create(fallbackReq as ChatCompletionCreateParams)
      } else if (shouldStream && shouldRetryWithoutStream(err)) {
        const fallbackReq = { ...initialReq, stream: false }
        requestPayload = fallbackReq as unknown as Record<string, unknown>
        res = await getClient().chat.completions.create(fallbackReq as ChatCompletionCreateParams)
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
        const fallbackReq = { ...initialReq, stream: false } as ChatCompletionCreateParams
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
  messages: ChatCompletionMessageParam[],
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
    const req: ChatCompletionCreateParams = {
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
