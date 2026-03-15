import type { ChatCompletionMessageParam } from "./openai-types.js"

export type LlmLogMode = "json" | "text"

export type LlmLogEntry = {
  id: string
  timestamp: string
  mode: LlmLogMode
  request_name: string
  schema_name?: string
  schema?: object
  request?: Record<string, unknown>
  messages: ChatCompletionMessageParam[]
  sampling: Record<string, unknown>
  stop?: string[]
  response?: {
    content?: string
    parsed?: unknown
  }
  error?: {
    message: string
    stack?: string
  }
}

function randomId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `${Date.now()}_${Math.random().toString(16).slice(2)}`
  }
}

export function logLlmEntry(entry: LlmLogEntry): void {
  console.debug("[llm-log]", entry)
}

export function createLlmLogBase(
  mode: LlmLogMode,
  requestName: string,
  messages: ChatCompletionMessageParam[],
  sampling: Record<string, unknown>,
  schemaName?: string,
  stop?: string[],
  schema?: object,
): LlmLogEntry {
  return {
    id: randomId(),
    timestamp: new Date().toISOString(),
    mode,
    request_name: requestName,
    schema_name: schemaName,
    schema,
    messages,
    sampling,
    stop,
  }
}
