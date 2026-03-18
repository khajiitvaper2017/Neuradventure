import { z } from "zod"
import { buildJsonSchemaResponseFormat } from "@/llm/schema/json-schema"
import { type CharacterCreation, type NPCState, type StoryModules, type TurnResponse } from "@/types/models"
import { buildLlmContract } from "@/llm/contract"
import { buildSamplingParams } from "@/llm/sampling"
import { createLlmLogBase, logLlmEntry } from "@/llm/logging"
import { getCachedSupportedParameters, getClient, getConnector, getGenerationParams } from "@/llm/client"
import { logOpenRouterJsonObjectFallback } from "@/llm/openrouter-routing"
import { buildInjectedJsonSchema, warnOnMissingSchemaDescriptions } from "@/llm/call/schema-pipeline"
import { getDefaultPreviewKeys, maybeCreatePreviewExtractor } from "@/llm/call/preview"
import {
  buildInitialRequest,
  buildOpenRouterReq,
  chooseInitialOpenRouterMode,
  type OpenRouterMode,
} from "@/llm/call/request-builder"
import { runStructuredChatCompletion, runTextChatCompletion } from "@/llm/call/completion-runner"
import { parseAndValidateJson } from "@/llm/call/validate"
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ResponseFormatJSONSchema,
} from "@/llm/openai-types"

export async function callLLM(
  messages: ChatCompletionMessageParam[],
  playerName: string,
  knownNpcs: NPCState[] = [],
  storyModules?: StoryModules,
  options: { onPreviewPatch?: (patch: Record<string, unknown>) => void } = {},
): Promise<TurnResponse> {
  const contract = buildLlmContract("turn", {
    modules: storyModules,
    playerName,
    knownNpcNames: knownNpcs.map((npc) => npc.name),
  })
  return (await callLLMRaw(messages, contract.schemaName, contract.zodSchema, undefined, {
    ...options,
    previewKeys: contract.previewKeys,
  })) as TurnResponse
}

export async function generateNpcCreation(
  messages: ChatCompletionMessageParam[],
  forcedName?: string,
  storyModules?: StoryModules,
): Promise<CharacterCreation> {
  const contract = buildLlmContract("character_creation", { modules: storyModules })
  const parsed = (await callLLMRaw(messages, contract.schemaName, contract.zodSchema, undefined, {
    previewKeys: contract.previewKeys,
  })) as CharacterCreation
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

  const { jsonSchema, missing } = buildInjectedJsonSchema(schemaName, zodSchema)
  warnOnMissingSchemaDescriptions(schemaName, missing)

  const logBase = createLlmLogBase("json", schemaName, messages, sampling, schemaName, undefined, jsonSchema)
  let responseContent: string | undefined
  let parsedCandidate: unknown | undefined
  let requestPayload: Record<string, unknown> | undefined

  const model = connector.type === "openrouter" ? connector.model : "local"
  const supportedParamSet = supportedParams && supportedParams.length > 0 ? new Set(supportedParams) : null
  const supportsResponseFormat = supportedParamSet ? supportedParamSet.has("response_format") : null
  const supportsStructuredOutputs = supportedParamSet ? supportedParamSet.has("structured_outputs") : null
  const shouldStream = typeof options.onPreviewPatch === "function"
  const previewKeys = options.previewKeys ?? getDefaultPreviewKeys(schemaName)
  const previewExtractor = maybeCreatePreviewExtractor(shouldStream, previewKeys)

  try {
    const schemaDescriptions: Record<string, string> = {
      TurnResponse: "Game turn response with narrative text and state updates",
      CharacterCreation: "Character creation data",
      GenerateStoryResponse: "Story setup response with starting state and initial character updates",
      GenerateCharacterResponse: "Character generation response",
    }

    const responseFormat = buildJsonSchemaResponseFormat(schemaName, jsonSchema, {
      // Always request strict mode; some backends may ignore it, but providers that
      // support JSON Schema should enforce it.
      strict: true,
      description: schemaDescriptions[schemaName],
    }) as ResponseFormatJSONSchema

    let openRouterMode: OpenRouterMode = "json_schema"
    if (connector.type === "openrouter") {
      openRouterMode = chooseInitialOpenRouterMode({ supportsResponseFormat, supportsStructuredOutputs })
    }
    if (connector.type === "openrouter" && openRouterMode === "json_object") {
      logOpenRouterJsonObjectFallback(schemaName, model, "model_lacks_structured_outputs", {
        supports_response_format: supportsResponseFormat,
        supports_structured_outputs: supportsStructuredOutputs,
      })
    }

    const { baseReq, initialReq } = buildInitialRequest({
      connector,
      model,
      messages,
      sampling,
      shouldStream,
      schemaName,
      jsonSchema,
      responseFormat,
      openRouterMode,
    })

    const buildOpenRouter =
      connector.type === "openrouter"
        ? (mode: OpenRouterMode) =>
            buildOpenRouterReq({
              mode,
              baseReq,
              messages,
              schemaName,
              jsonSchema,
              responseFormat,
            })
        : undefined

    const result = await runStructuredChatCompletion({
      connector,
      schemaName,
      model,
      supportedParams,
      supportsResponseFormat,
      supportsStructuredOutputs,
      initialReq,
      openRouterMode: connector.type === "openrouter" ? openRouterMode : null,
      buildOpenRouterReq: buildOpenRouter,
      create: (req) => getClient().chat.completions.create(req),
      shouldStream,
      previewExtractor,
      onPreviewPatch: options.onPreviewPatch,
    })

    requestPayload = result.requestPayload
    responseContent = result.responseContent

    const validated = parseAndValidateJson({ schemaName, zodSchema, responseContent })
    const parsed = validated.parsed
    parsedCandidate = validated.parsedCandidate

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

    const result = await runTextChatCompletion({
      create: (r) => getClient().chat.completions.create(r),
      req,
      shouldStream,
      onText: options.onText,
    })

    requestPayload = result.requestPayload
    responseContent = result.responseContent

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
