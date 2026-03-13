import OpenAI from "openai"
import { type GenerationParams, type LLMConnector, getSettings } from "../core/db.js"
import { findContextLength, getCachedUpstreamModels } from "./models.js"

// ─── OpenAI client (re-created when connector settings change) ───────────────

let cachedClient: OpenAI | null = null
let cachedClientKey = ""
let cachedCtxLimit = 0
let cachedCtxLimitAt = 0
let cachedCtxLimitKey = ""

export function getClient(): OpenAI {
  const { connector } = getSettings()
  const apiKey = connector.api_keys[connector.type]
  const key = `${connector.type}|${connector.url}|${apiKey}`
  if (cachedClient && cachedClientKey === key) return cachedClient
  const defaultHeaders =
    connector.type === "openrouter"
      ? {
          "HTTP-Referer": "http://localhost",
          "X-Title": "NeuradventureV2",
          "X-OpenRouter-Title": "NeuradventureV2",
        }
      : undefined
  cachedClient = new OpenAI({ baseURL: connector.url, apiKey: apiKey, defaultHeaders })
  cachedClientKey = key
  return cachedClient
}

export function getGenerationParams(): GenerationParams {
  return getSettings().generation
}

export function getConnector(): LLMConnector {
  return getSettings().connector
}

function stripV1(url: string): string {
  return url.replace(/\/v1\/?$/, "")
}

function parseCtxLimit(payload: unknown): number | null {
  if (typeof payload === "number" && Number.isFinite(payload)) return payload
  if (typeof payload === "string") {
    const val = Number(payload.trim())
    return Number.isFinite(val) ? val : null
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>
    const direct =
      obj.max_context_length ??
      obj.context_length ??
      obj.ctx_limit ??
      obj.n_ctx ??
      obj.value ??
      obj.max_ctx ??
      obj.max_length
    if (typeof direct === "number" && Number.isFinite(direct)) return direct
    if (Array.isArray(obj.data)) {
      for (const item of obj.data) {
        if (!item || typeof item !== "object") continue
        const dataObj = item as Record<string, unknown>
        const val =
          dataObj.max_context_length ??
          dataObj.context_length ??
          dataObj.ctx_limit ??
          dataObj.n_ctx ??
          dataObj.value ??
          dataObj.max_ctx ??
          dataObj.max_length
        if (typeof val === "number" && Number.isFinite(val)) return val
      }
    }
  }
  return null
}

function connectorCtxKey(connector: LLMConnector): string {
  return connector.type === "openrouter"
    ? `${connector.type}|${connector.url}|${connector.model}`
    : `${connector.type}|${connector.url}`
}

async function fetchCtxLimitFromKobold(
  connector: Extract<LLMConnector, { type: "koboldcpp" }>,
): Promise<number | null> {
  const base = stripV1(connector.url)
  const candidates = [
    `${base}/api/extra/true_max_context_length`,
    `${base}/api/v1/config/max_context_length`,
    `${base}/api/v1/config/ctx_limit`,
    `${connector.url.replace(/\/?$/, "/")}models`,
  ]

  for (const url of candidates) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const text = await res.text()
      let payload: unknown = text
      try {
        payload = JSON.parse(text)
      } catch {
        // keep text
      }
      const val = parseCtxLimit(payload)
      if (val && val > 0) return val
    } catch {
      // ignore and try next
    }
  }
  return null
}

async function fetchCtxLimitFromOpenRouter(
  connector: Extract<LLMConnector, { type: "openrouter" }>,
): Promise<number | null> {
  const models = await getCachedUpstreamModels(connector)
  return findContextLength(models, connector.model)
}

export async function getCtxLimit(): Promise<number> {
  const gen = getGenerationParams()
  if (gen.ctx_limit > 0) return gen.ctx_limit
  const now = Date.now()
  const connector = getConnector()
  const key = connectorCtxKey(connector)
  if (cachedCtxLimitKey === key && cachedCtxLimit > 0 && now - cachedCtxLimitAt < 5 * 60 * 1000) return cachedCtxLimit

  if (cachedCtxLimitKey !== key) {
    cachedCtxLimitKey = key
    cachedCtxLimit = 0
    cachedCtxLimitAt = 0
  }

  const fetched =
    connector.type === "koboldcpp"
      ? await fetchCtxLimitFromKobold(connector)
      : await fetchCtxLimitFromOpenRouter(connector)
  if (fetched && fetched > 0) {
    cachedCtxLimit = fetched
    cachedCtxLimitAt = now
    return fetched
  }
  return 0
}

export async function initCtxLimit(): Promise<void> {
  cachedCtxLimit = await getCtxLimit()
  cachedCtxLimitAt = Date.now()
}

export function getCtxLimitCached(): number {
  const gen = getGenerationParams()
  if (gen.ctx_limit > 0) return gen.ctx_limit
  const key = connectorCtxKey(getConnector())
  if (cachedCtxLimitKey !== key) return 0
  return cachedCtxLimit
}
