import { getSettings } from "@/db/core"
import type { GenerationParams, LLMConnector } from "@/types/api"
import { findContextLength, getCachedUpstreamModels, getModelSupportedParameters } from "@/llm/models"
import { fetchWithTimeout } from "@/utils/fetch-timeout"
import type { LlmClient } from "@/llm/openai-types"
import { createChatCompletion, listModels } from "@/llm/io/upstream"
import {
  INTERNAL_CTX_LIMIT_CACHE_TTL_MS,
  INTERNAL_SUPPORTED_PARAMS_CACHE_TTL_MS,
  INTERNAL_UPSTREAM_FETCH_TIMEOUT_MS,
} from "@/config/internal-timeouts"

// ─── Client (re-created when connector settings change) ──────────────────────

let cachedClient: LlmClient | null = null
let cachedClientKey = ""
let cachedCtxLimit = 0
let cachedCtxLimitAt = 0
let cachedCtxLimitKey = ""

// ─── Supported parameters cache (OpenRouter only) ───────────────────────────

let cachedSupportedParams: string[] | null = null
let cachedSupportedParamsKey = ""
let cachedSupportedParamsAt = 0

function fnv1a32(text: string): string {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(36)
}

export async function getCachedSupportedParameters(): Promise<string[] | null> {
  const connector = getConnector()
  if (connector.type !== "openrouter") return null

  const key = `${connector.type}|${connector.url}|${connector.model}`
  const now = Date.now()
  const ttlMs = INTERNAL_SUPPORTED_PARAMS_CACHE_TTL_MS
  if (cachedSupportedParamsKey === key && cachedSupportedParams && now - cachedSupportedParamsAt < ttlMs) {
    return cachedSupportedParams
  }

  try {
    const models = await getCachedUpstreamModels(connector)
    const params = getModelSupportedParameters(models, connector.model)
    cachedSupportedParams = params
    cachedSupportedParamsKey = key
    cachedSupportedParamsAt = now
    return params
  } catch {
    // On error, return cached value if key matches, otherwise null
    if (cachedSupportedParamsKey === key) return cachedSupportedParams
    return null
  }
}

export function getClient(): LlmClient {
  const { connector, timeouts } = getSettings()
  const apiKey = connector.api_keys[connector.type]
  const key = `${connector.type}|${connector.url}|k=${fnv1a32(apiKey)}|${timeouts.llmRequestMs}|${INTERNAL_UPSTREAM_FETCH_TIMEOUT_MS}`
  if (cachedClient && cachedClientKey === key) return cachedClient

  cachedClient = {
    chat: {
      completions: {
        create: (params) => createChatCompletion(connector, params, timeouts.llmRequestMs),
      },
    },
    models: {
      list: () => listModels(connector, INTERNAL_UPSTREAM_FETCH_TIMEOUT_MS),
    },
  }

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
  const timeoutMs = INTERNAL_UPSTREAM_FETCH_TIMEOUT_MS
  const candidates = [
    `${base}/api/extra/true_max_context_length`,
    `${base}/api/v1/config/max_context_length`,
    `${base}/api/v1/config/ctx_limit`,
    `${connector.url.replace(/\/?$/, "/")}models`,
  ]

  for (const url of candidates) {
    try {
      const res = await fetchWithTimeout(url, {}, timeoutMs)
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
  const ttlMs = INTERNAL_CTX_LIMIT_CACHE_TTL_MS
  if (cachedCtxLimitKey === key && cachedCtxLimit > 0 && now - cachedCtxLimitAt < ttlMs) return cachedCtxLimit

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
