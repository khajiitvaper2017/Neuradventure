import type { LLMConnector } from "@/types/api"
import { listModels } from "@/llm/io/upstream"
import { INTERNAL_MODELS_CACHE_TTL_MS, INTERNAL_UPSTREAM_FETCH_TIMEOUT_MS } from "@/config/internal-timeouts"

export type UpstreamModelInfo = {
  id: string
  name?: string
  context_length?: number
  supported_parameters?: string[]
}

type ModelsCacheEntry = {
  fetchedAt: number
  models: UpstreamModelInfo[]
}

const modelsCache = new Map<string, ModelsCacheEntry>()

function cacheKey(connector: LLMConnector): string {
  return `${connector.type}|${connector.url}`
}

function pickModelInfo(raw: unknown): UpstreamModelInfo | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const id = typeof obj.id === "string" ? obj.id : null
  if (!id) return null
  const name = typeof obj.name === "string" ? obj.name : undefined
  const ctx =
    typeof obj.context_length === "number"
      ? obj.context_length
      : typeof obj.max_context_length === "number"
        ? obj.max_context_length
        : undefined
  const supportedParams = Array.isArray(obj.supported_parameters)
    ? obj.supported_parameters.filter((p): p is string => typeof p === "string")
    : undefined
  return {
    id,
    ...(name ? { name } : {}),
    ...(ctx ? { context_length: ctx } : {}),
    ...(supportedParams && supportedParams.length > 0 ? { supported_parameters: supportedParams } : {}),
  }
}

function parseModelsPayload(payload: unknown): UpstreamModelInfo[] {
  if (Array.isArray(payload)) {
    return payload.map(pickModelInfo).filter((x): x is UpstreamModelInfo => x !== null)
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>
    const data = obj.data
    if (Array.isArray(data)) {
      return data.map(pickModelInfo).filter((x): x is UpstreamModelInfo => x !== null)
    }
  }
  return []
}

async function fetchUpstreamModels(connector: LLMConnector): Promise<UpstreamModelInfo[]> {
  const timeoutMs = INTERNAL_UPSTREAM_FETCH_TIMEOUT_MS
  const payload = await listModels(connector, timeoutMs)
  return parseModelsPayload(payload)
}

export async function getCachedUpstreamModels(connector: LLMConnector): Promise<UpstreamModelInfo[]> {
  const key = cacheKey(connector)
  const now = Date.now()
  const cached = modelsCache.get(key)
  const ttlMs = INTERNAL_MODELS_CACHE_TTL_MS
  if (cached && now - cached.fetchedAt < ttlMs) return cached.models

  try {
    const models = await fetchUpstreamModels(connector)
    modelsCache.set(key, { fetchedAt: now, models })
    return models
  } catch (err) {
    if (cached) return cached.models
    throw err
  }
}

export function findContextLength(models: UpstreamModelInfo[], modelId: string): number | null {
  const match = models.find((m) => m.id === modelId)
  const val = match?.context_length
  return typeof val === "number" && Number.isFinite(val) && val > 0 ? val : null
}

export function getModelSupportedParameters(models: UpstreamModelInfo[], modelId: string): string[] | null {
  const match = models.find((m) => m.id === modelId)
  const params = match?.supported_parameters
  return Array.isArray(params) && params.length > 0 ? params : null
}
