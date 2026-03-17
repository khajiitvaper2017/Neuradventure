import {
  describeResponseShape,
  extractContentFromUnknown,
  isAsyncIterable,
  readStreamedText,
  shouldRetryWithoutStream,
} from "@/llm/io/response-extract"
import {
  extractOpenRouterNoEndpointMessage,
  formatOpenRouterRoutingDiagnostics,
  logOpenRouterJsonObjectFallback,
  maybeLogOpenRouterResolvedModel,
  maybeLogOpenRouterSupportedParametersForSelection,
  shortErrorForLog,
  shouldDropResponseFormat,
  shouldFallbackFromJsonSchema,
} from "@/llm/openrouter-routing"
import type { LLMConnector } from "@/types/api"
import type { ChatCompletionCreateParams } from "@/llm/openai-types"
import type { OpenRouterMode } from "@/llm/call/request-builder"
import type { PreviewExtractor } from "@/llm/call/preview"

export async function runStructuredChatCompletion(args: {
  connector: LLMConnector
  schemaName: string
  model: string
  supportedParams: string[] | null
  supportsResponseFormat: boolean | null
  supportsStructuredOutputs: boolean | null
  initialReq: ChatCompletionCreateParams
  openRouterMode: OpenRouterMode | null
  buildOpenRouterReq?: (mode: OpenRouterMode) => ChatCompletionCreateParams
  create: (req: ChatCompletionCreateParams) => Promise<unknown>
  shouldStream: boolean
  previewExtractor: PreviewExtractor | null
  onPreviewPatch?: (patch: Record<string, unknown>) => void
}): Promise<{ requestPayload: Record<string, unknown>; responseContent: string; shape: string }> {
  let requestPayload: Record<string, unknown> = args.initialReq as unknown as Record<string, unknown>
  let openRouterMode = args.openRouterMode

  let res: unknown
  try {
    if (args.connector.type === "openrouter") {
      maybeLogOpenRouterSupportedParametersForSelection(
        args.model,
        requestPayload,
        args.schemaName,
        args.supportedParams,
      )
    }
    res = await args.create(args.initialReq)
  } catch (err) {
    const msg = String(err)

    const openRouterNoEndpointMessage =
      args.connector.type === "openrouter" ? extractOpenRouterNoEndpointMessage(err) : null
    if (
      args.connector.type === "openrouter" &&
      openRouterMode === "json_schema" &&
      args.buildOpenRouterReq &&
      (shouldFallbackFromJsonSchema(err) || !!openRouterNoEndpointMessage)
    ) {
      const fallbackMode: OpenRouterMode = args.supportsResponseFormat === false ? "none" : "json_object"
      try {
        if (fallbackMode === "json_object") {
          logOpenRouterJsonObjectFallback(args.schemaName, args.model, "request_rejected_json_schema", {
            error: shortErrorForLog(err),
            supports_response_format: args.supportsResponseFormat,
            supports_structured_outputs: args.supportsStructuredOutputs,
          })
        }
        const fallbackReq = args.buildOpenRouterReq(fallbackMode)
        requestPayload = fallbackReq as unknown as Record<string, unknown>
        openRouterMode = fallbackMode
        res = await args.create(fallbackReq)
      } catch (err2) {
        if (fallbackMode === "json_object" && shouldDropResponseFormat(err2) && args.buildOpenRouterReq) {
          console.info(
            `[llm-openrouter] fallback=drop_response_format_after_json_object schema=${args.schemaName} model=${args.model} error=${shortErrorForLog(err2)}`,
          )
          const fallbackReq2 = args.buildOpenRouterReq("none")
          requestPayload = fallbackReq2 as unknown as Record<string, unknown>
          openRouterMode = "none"
          res = await args.create(fallbackReq2)
        } else if (openRouterNoEndpointMessage) {
          const diagnostics = formatOpenRouterRoutingDiagnostics(
            args.initialReq as unknown as Record<string, unknown>,
            args.schemaName,
            args.model,
            args.supportedParams,
          )
          throw new Error(`OpenRouter routing failed (404): ${openRouterNoEndpointMessage}\n${diagnostics}`, {
            cause: err2 as unknown,
          })
        } else {
          throw err2
        }
      }
    } else if (
      args.connector.type === "openrouter" &&
      openRouterMode === "json_object" &&
      shouldDropResponseFormat(err) &&
      args.buildOpenRouterReq
    ) {
      console.info(
        `[llm-openrouter] fallback=drop_response_format_after_json_object schema=${args.schemaName} model=${args.model} error=${shortErrorForLog(err)}`,
      )
      const fallbackReq = args.buildOpenRouterReq("none")
      requestPayload = fallbackReq as unknown as Record<string, unknown>
      openRouterMode = "none"
      res = await args.create(fallbackReq)
    } else if (openRouterNoEndpointMessage) {
      const diagnostics = formatOpenRouterRoutingDiagnostics(
        args.initialReq as unknown as Record<string, unknown>,
        args.schemaName,
        args.model,
        args.supportedParams,
      )
      throw new Error(`OpenRouter routing failed (404): ${openRouterNoEndpointMessage}\n${diagnostics}`, {
        cause: err as unknown,
      })
    }

    if (
      args.connector.type === "koboldcpp" &&
      (msg.includes("response_format") || msg.includes("json_schema") || msg.includes("strict"))
    ) {
      // If the backend rejects `response_format`, fall back to grammar-only mode.
      // KoboldCpp should still honor `json_schema` via grammar conversion.
      const fallbackReq = { ...args.initialReq } as unknown as Record<string, unknown>
      delete fallbackReq.response_format
      requestPayload = fallbackReq
      res = await args.create(fallbackReq as unknown as ChatCompletionCreateParams)
    } else if (args.shouldStream && shouldRetryWithoutStream(err)) {
      const fallbackReq = { ...args.initialReq, stream: false }
      requestPayload = fallbackReq as unknown as Record<string, unknown>
      res = await args.create(fallbackReq)
    } else {
      throw err
    }
  }

  if (args.connector.type === "openrouter") maybeLogOpenRouterResolvedModel(args.model, res)

  const shape = describeResponseShape(res)

  let responseContent: string | null = null
  if (args.shouldStream && args.previewExtractor && isAsyncIterable(res)) {
    try {
      responseContent = await readStreamedText(res, (delta) => {
        const patch = args.previewExtractor?.push(delta)
        if (patch) args.onPreviewPatch?.(patch)
      })
    } catch (err) {
      if (!shouldRetryWithoutStream(err)) throw err
      const fallbackReq = { ...args.initialReq, stream: false }
      requestPayload = fallbackReq as unknown as Record<string, unknown>
      const fallbackRes = await args.create(fallbackReq)
      responseContent = await extractContentFromUnknown(fallbackRes)
      if (responseContent) {
        const patch = args.previewExtractor.push(responseContent)
        if (patch) args.onPreviewPatch?.(patch)
      }
    }
  } else {
    responseContent = await extractContentFromUnknown(res)
    if (args.shouldStream && args.previewExtractor && responseContent) {
      const patch = args.previewExtractor.push(responseContent)
      if (patch) args.onPreviewPatch?.(patch)
    }
  }

  if (!responseContent) throw new Error(`LLM returned empty response. Shape: ${shape}`)
  return { requestPayload, responseContent, shape }
}

export async function runTextChatCompletion(args: {
  create: (req: ChatCompletionCreateParams) => Promise<unknown>
  req: ChatCompletionCreateParams
  shouldStream: boolean
  onText?: (text: string) => void
}): Promise<{ requestPayload: Record<string, unknown>; responseContent: string; shape: string }> {
  let requestPayload: Record<string, unknown> = args.req as unknown as Record<string, unknown>

  let res: unknown
  try {
    res = await args.create(args.req)
  } catch (err) {
    if (args.shouldStream && shouldRetryWithoutStream(err)) {
      const fallbackReq = { ...args.req, stream: false }
      requestPayload = fallbackReq as unknown as Record<string, unknown>
      res = await args.create(fallbackReq)
    } else {
      throw err
    }
  }

  const shape = describeResponseShape(res)

  let responseContent: string | null = null
  if (args.shouldStream && isAsyncIterable(res)) {
    try {
      responseContent = await readStreamedText(res, (_delta, full) => {
        args.onText?.(full)
      })
    } catch (err) {
      if (!shouldRetryWithoutStream(err)) throw err
      const fallbackReq = { ...args.req, stream: false }
      requestPayload = fallbackReq as unknown as Record<string, unknown>
      const fallbackRes = await args.create(fallbackReq)
      responseContent = await extractContentFromUnknown(fallbackRes)
      if (responseContent) args.onText?.(responseContent)
    }
  } else {
    responseContent = await extractContentFromUnknown(res)
    if (args.shouldStream && responseContent) args.onText?.(responseContent)
  }

  if (!responseContent) throw new Error(`LLM returned empty response. Shape: ${shape}`)
  return { requestPayload, responseContent, shape }
}
