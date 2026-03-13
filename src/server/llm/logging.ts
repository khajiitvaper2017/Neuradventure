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
  schema_name?: string
  schema?: object
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

async function writeEntry(entry: LlmLogEntry): Promise<void> {
  await mkdir(LOG_DIR, { recursive: true })
  await appendFile(llmLogPath, `${JSON.stringify(entry)}\n`)
  await writeFile(llmLastPath, JSON.stringify(entry, null, 2))
}

export function logLlmEntry(entry: LlmLogEntry): void {
  void writeEntry(entry).catch((err) => {
    console.error("[llm-log] Failed to write log entry", err)
  })
}

export function createLlmLogBase(
  mode: LlmLogMode,
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
    schema_name: schemaName,
    schema,
    messages,
    sampling,
    stop,
  }
}
