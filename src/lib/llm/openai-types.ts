import { LlmRole } from "@/types/roles"

export type ChatRole = LlmRole

export type ChatCompletionMessageParam = {
  role: ChatRole
  content: string
}

export type ResponseFormatJSONSchema = {
  type: "json_schema"
  json_schema: { name: string; description?: string; schema: object; strict?: boolean }
}

export type ResponseFormatJSONObject = {
  type: "json_object"
}

export type ChatCompletionCreateParams = {
  model: string
  messages: ChatCompletionMessageParam[]
  stream?: boolean
  stop?: string[]
  response_format?: ResponseFormatJSONSchema | ResponseFormatJSONObject | { type: string }
  [key: string]: unknown
}

export type LlmClient = {
  chat: {
    completions: {
      create: (params: ChatCompletionCreateParams) => Promise<unknown>
    }
  }
  models: {
    list: () => Promise<unknown>
  }
}
