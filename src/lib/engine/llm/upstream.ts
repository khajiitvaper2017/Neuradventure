import { fetchWithTimeout } from "@/engine/utils/fetch-timeout"
import type { LLMConnector } from "@/shared/api-types"
import type { ChatCompletionCreateParams } from "@/engine/llm/openai-types"
import { OPENROUTER_APP_TITLE } from "@/shared/config/app"

function buildUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/?$/, "/")
  return base + path.replace(/^\//, "")
}

function sanitizeUrlForLog(rawUrl: string): string {
  try {
    const u = new URL(rawUrl)
    return `${u.origin}${u.pathname}`
  } catch {
    return rawUrl.split("?")[0] ?? rawUrl
  }
}

function nowMs(): number {
  try {
    return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now()
  } catch {
    return Date.now()
  }
}

function safeMessageCount(params: ChatCompletionCreateParams): number {
  const msgs = (params as unknown as { messages?: unknown }).messages
  return Array.isArray(msgs) ? msgs.length : 0
}

function safeModel(params: ChatCompletionCreateParams): string | null {
  const model = (params as unknown as { model?: unknown }).model
  return typeof model === "string" && model.trim() ? model.trim() : null
}

function shouldLogRequestPayload(): boolean {
  try {
    if (import.meta.env.DEV) return true
  } catch {
    // ignore
  }
  try {
    return typeof localStorage !== "undefined" && localStorage.getItem("neuradventure:debug:llm_request") === "1"
  } catch {
    return false
  }
}

function redactHeadersForLog(headers: Record<string, string>): Record<string, string> {
  const redacted: Record<string, string> = { ...headers }
  if (typeof redacted.Authorization === "string" && redacted.Authorization.trim())
    redacted.Authorization = "Bearer [redacted]"
  return redacted
}

export function buildChatCompletionsUrl(connector: LLMConnector): string {
  return buildUrl(connector.url, "/chat/completions")
}

export function buildModelsUrl(connector: LLMConnector): string {
  return buildUrl(connector.url, "/models")
}

export function buildUpstreamHeaders(connector: LLMConnector): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    "Content-Type": "application/json",
  }

  const key = connector.api_keys[connector.type].trim()
  if (key) headers.Authorization = `Bearer ${key}`

  if (connector.type === "openrouter") {
    const referer =
      typeof location !== "undefined" && typeof location.origin === "string" && location.origin
        ? location.origin
        : "http://localhost"
    headers["HTTP-Referer"] = referer
    headers["X-Title"] = OPENROUTER_APP_TITLE
    headers["X-OpenRouter-Title"] = OPENROUTER_APP_TITLE
  }

  return headers
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

function extractErrorMessage(payload: unknown): string | null {
  const obj = asRecord(payload)
  if (!obj) return null
  const message = obj.message
  if (typeof message === "string" && message.trim()) return message.trim()
  const errorObj = asRecord(obj.error)
  const nested = errorObj?.message
  return typeof nested === "string" && nested.trim() ? nested.trim() : null
}

export class UpstreamError extends Error {
  constructor(
    public status: number,
    message: string,
    public url: string,
    public bodyText?: string,
    public bodyJson?: unknown,
  ) {
    super(message)
    this.name = "UpstreamError"
  }
}

async function readErrorBody(res: Response): Promise<{ bodyText: string; bodyJson: unknown | null; message: string }> {
  const bodyText = await res.text().catch(() => "")
  let bodyJson: unknown | null = null
  if (bodyText) {
    try {
      bodyJson = JSON.parse(bodyText) as unknown
    } catch {
      bodyJson = null
    }
  }
  const extracted = bodyJson ? extractErrorMessage(bodyJson) : null
  const message = extracted || bodyText || res.statusText || `Upstream error (${res.status})`
  return { bodyText, bodyJson, message }
}

type ReadableStreamLike = ReadableStream<Uint8Array>

async function* parseSseJson(body: ReadableStreamLike): AsyncIterable<unknown> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      buffer += decoder.decode(value, { stream: true })

      while (true) {
        let sepIndex = buffer.indexOf("\n\n")
        let sepLen = 2
        const alt = buffer.indexOf("\r\n\r\n")
        if (alt >= 0 && (sepIndex < 0 || alt < sepIndex)) {
          sepIndex = alt
          sepLen = 4
        }
        if (sepIndex < 0) break

        const rawEvent = buffer.slice(0, sepIndex)
        buffer = buffer.slice(sepIndex + sepLen)

        const lines = rawEvent.split(/\r?\n/)
        const dataLines = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart())
        if (dataLines.length === 0) continue

        const data = dataLines.join("\n").trim()
        if (!data) continue
        if (data === "[DONE]") return

        try {
          yield JSON.parse(data) as unknown
        } catch {
          // ignore malformed events
        }
      }
    }
  } finally {
    reader.releaseLock()
  }
}

export async function createChatCompletion(
  connector: LLMConnector,
  params: ChatCompletionCreateParams,
  timeoutMs: number,
): Promise<unknown> {
  const url = buildChatCompletionsUrl(connector)
  const logUrl = sanitizeUrlForLog(url)
  const startedAt = nowMs()
  const model = safeModel(params)
  const stream = params.stream === true
  const messageCount = safeMessageCount(params)
  const headers = buildUpstreamHeaders(connector)
  console.info(
    `[llm-http] -> POST ${logUrl} type=${connector.type}${model ? ` model=${model}` : ""} stream=${String(stream)} messages=${messageCount}`,
  )
  if (shouldLogRequestPayload()) {
    console.info("[llm-http] request payload", params)
    console.info("[llm-http] request headers", redactHeadersForLog(headers))
  }

  let res: Response
  try {
    res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers,
        body: JSON.stringify(params),
      },
      timeoutMs,
    )
  } catch (err) {
    const ms = Math.max(0, Math.round(nowMs() - startedAt))
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(
      `[llm-http] <- ERROR ${logUrl} (${ms}ms) type=${connector.type}${model ? ` model=${model}` : ""} error=${msg}`,
    )
    throw err
  }

  const ms = Math.max(0, Math.round(nowMs() - startedAt))
  console.info(`[llm-http] <- ${res.status} ${logUrl} (${ms}ms)`)

  if (!res.ok) {
    const { bodyText, bodyJson, message } = await readErrorBody(res)
    throw new UpstreamError(res.status, message, url, bodyText, bodyJson)
  }

  if (stream) {
    if (!res.body) throw new UpstreamError(res.status, "Upstream response has no body", url)
    return parseSseJson(res.body)
  }

  try {
    return (await res.json()) as unknown
  } catch {
    const text = await res.text().catch(() => "")
    return text
  }
}

export async function listModels(connector: LLMConnector, timeoutMs: number): Promise<unknown> {
  const url = buildModelsUrl(connector)
  const logUrl = sanitizeUrlForLog(url)
  const startedAt = nowMs()
  console.info(`[llm-http] -> GET ${logUrl} type=${connector.type}`)
  let res: Response
  try {
    res = await fetchWithTimeout(url, { headers: buildUpstreamHeaders(connector) }, timeoutMs)
  } catch (err) {
    const ms = Math.max(0, Math.round(nowMs() - startedAt))
    const msg = err instanceof Error ? err.message : String(err)
    console.warn(`[llm-http] <- ERROR ${logUrl} (${ms}ms) type=${connector.type} error=${msg}`)
    throw err
  }
  const ms = Math.max(0, Math.round(nowMs() - startedAt))
  console.info(`[llm-http] <- ${res.status} ${logUrl} (${ms}ms)`)
  if (!res.ok) {
    const { bodyText, bodyJson, message } = await readErrorBody(res)
    throw new UpstreamError(res.status, message, url, bodyText, bodyJson)
  }
  return (await res.json()) as unknown
}
