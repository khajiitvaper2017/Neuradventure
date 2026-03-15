import { injectOutputSchemaIntoMessages } from "@/engine/llm/schema-in-prompt"
import type { LLMConnector } from "@/shared/api-types"
import type {
  ChatCompletionCreateParams,
  ChatCompletionMessageParam,
  ResponseFormatJSONSchema,
  ResponseFormatJSONObject,
} from "@/engine/llm/openai-types"

export type OpenRouterMode = "json_schema" | "json_object" | "none"

export function chooseInitialOpenRouterMode(args: {
  supportsResponseFormat: boolean | null
  supportsStructuredOutputs: boolean | null
}): OpenRouterMode {
  if (args.supportsStructuredOutputs === false) {
    return args.supportsResponseFormat === false ? "none" : "json_object"
  }
  return "json_schema"
}

export function buildOpenRouterReq(args: {
  mode: OpenRouterMode
  baseReq: ChatCompletionCreateParams
  messages: ChatCompletionMessageParam[]
  schemaName: string
  jsonSchema: object
  responseFormat: ResponseFormatJSONSchema
}): ChatCompletionCreateParams {
  const nextMessages =
    args.mode === "json_schema"
      ? args.messages
      : injectOutputSchemaIntoMessages(args.messages, args.schemaName, args.jsonSchema)

  const req: ChatCompletionCreateParams = { ...args.baseReq, messages: nextMessages }
  if (args.mode === "json_schema") {
    req.response_format = args.responseFormat
  } else if (args.mode === "json_object") {
    req.response_format = { type: "json_object" } as ResponseFormatJSONObject
  }
  return req
}

export function buildInitialRequest(args: {
  connector: LLMConnector
  model: string
  messages: ChatCompletionMessageParam[]
  sampling: Record<string, unknown>
  shouldStream: boolean
  schemaName: string
  jsonSchema: object
  responseFormat: ResponseFormatJSONSchema
  openRouterMode: OpenRouterMode
}): { baseReq: ChatCompletionCreateParams; initialReq: ChatCompletionCreateParams } {
  const baseReq: ChatCompletionCreateParams = {
    model: args.model,
    messages: args.messages,
    ...(args.sampling as unknown as Record<string, never>),
    stream: args.shouldStream,
  }

  const initialReq =
    args.connector.type === "koboldcpp"
      ? ({
          ...baseReq,
          response_format: args.responseFormat,
          // Ensure KoboldCpp applies schema-derived grammar even if response_format is ignored.
          json_schema: args.jsonSchema,
          grammar_lazy: false,
          grammar_triggers: [],
        } as ChatCompletionCreateParams & {
          json_schema: object
          grammar_lazy: boolean
          grammar_triggers: unknown[]
        })
      : args.connector.type === "openrouter"
        ? buildOpenRouterReq({
            mode: args.openRouterMode,
            baseReq,
            messages: args.messages,
            schemaName: args.schemaName,
            jsonSchema: args.jsonSchema,
            responseFormat: args.responseFormat,
          })
        : ({
            ...baseReq,
            response_format: args.responseFormat,
          } as ChatCompletionCreateParams)

  return { baseReq, initialReq: initialReq as ChatCompletionCreateParams }
}
