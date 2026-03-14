import type OpenAI from "openai"
import { randomUUID } from "node:crypto"
import { appendFile, mkdir, writeFile } from "node:fs/promises"
import { join } from "node:path"
import { LOG_DIR } from "../utils/log-paths.js"

export type LlmLogMode = "json" | "text"

export type LlmLogEntry = {
  id: string
  timestamp: string
  mode: LlmLogMode
  request_name: string
  schema_name?: string
  schema?: object
  request?: Record<string, unknown>
  messages: OpenAI.ChatCompletionMessageParam[]
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

const llmLogPath = join(LOG_DIR, "llm.log")
const llmLastPath = join(LOG_DIR, "llm-last.json")
const llmLastRequestPath = join(LOG_DIR, "llm-last-request.json")

function safeFilePart(raw: string): string {
  const trimmed = raw.trim()
  if (!trimmed) return "unknown"
  const safe = trimmed.replace(/[^a-zA-Z0-9_-]+/g, "_")
  return safe.length > 120 ? safe.slice(0, 120) : safe
}

type LastRequestLog = Pick<LlmLogEntry, "id" | "timestamp" | "mode" | "request_name" | "schema_name" | "request">

async function writeEntry(entry: LlmLogEntry): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true })
  await appendFile(llmLogPath, `${JSON.stringify(entry)}\n`)
  await writeFile(llmLastPath, JSON.stringify(entry, null, 2))

  const requestName = safeFilePart(entry.request_name || entry.schema_name || entry.mode)
  const byRequestPath = join(LOG_DIR, `llm-last-${requestName}.json`)
  await writeFile(byRequestPath, JSON.stringify(entry, null, 2))

  if (entry.request) {
    const requestEntry: LastRequestLog = {
      id: entry.id,
      timestamp: entry.timestamp,
      mode: entry.mode,
      request_name: entry.request_name,
      schema_name: entry.schema_name,
      request: entry.request,
    }
    await writeFile(llmLastRequestPath, JSON.stringify(requestEntry, null, 2))
    const byRequestRequestPath = join(LOG_DIR, `llm-last-request-${requestName}.json`)
    await writeFile(byRequestRequestPath, JSON.stringify(requestEntry, null, 2))
  }
}

export function logLlmEntry(entry: LlmLogEntry): void {
  void writeEntry(entry).catch((err) => {
    console.error("[llm-log] Failed to write log entry", err)
  })
}

export function createLlmLogBase(
  mode: LlmLogMode,
  requestName: string,
  messages: OpenAI.ChatCompletionMessageParam[],
  sampling: Record<string, unknown>,
  schemaName?: string,
  stop?: string[],
  schema?: object,
): LlmLogEntry {
  return {
    id: randomUUID(),
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
