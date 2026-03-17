import type { ChatCompletionMessageParam } from "@/llm/openai-types"

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
  const messageCount = Array.isArray(entry.messages) ? entry.messages.length : 0
  const hasError = !!entry.error?.message
  const contentLen = entry.response?.content ? entry.response.content.length : 0
  const model = typeof entry.request?.model === "string" ? entry.request.model : undefined
  const stream = typeof entry.request?.stream === "boolean" ? entry.request.stream : undefined

  const parts: string[] = []
  parts.push(`[llm-log] ${entry.request_name}`)
  if (entry.schema_name) parts.push(`schema=${entry.schema_name}`)
  if (model) parts.push(`model=${model}`)
  if (stream !== undefined) parts.push(`stream=${String(stream)}`)
  parts.push(`messages=${messageCount}`)
  if (contentLen > 0) parts.push(`content_len=${contentLen}`)
  if (hasError) parts.push(`error=${entry.error?.message}`)

  console.info(parts.join(" "))
  console.debug("[llm-log:detail]", entry)
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
