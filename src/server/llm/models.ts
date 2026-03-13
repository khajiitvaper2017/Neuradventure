import type { LLMConnector } from "../core/db.js"

export type UpstreamModelInfo = {
  id: string
  name?: string
  context_length?: number
}

type ModelsCacheEntry = {
  fetchedAt: number
  models: UpstreamModelInfo[]
}

const MODELS_CACHE_TTL_MS = 5 * 60 * 1000
const modelsCache = new Map<string, ModelsCacheEntry>()

function cacheKey(connector: LLMConnector): string {
  return `${connector.type}|${connector.url}`
}

function buildModelsUrl(connector: LLMConnector): string {
  return connector.url.replace(/\/?$/, "/") + "models"
}

function buildUpstreamHeaders(connector: LLMConnector): Record<string, string> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  }
  const key = connector.api_keys[connector.type].trim()
  if (key) headers.Authorization = `Bearer ${key}`
  if (connector.type === "openrouter") {
    headers["HTTP-Referer"] = "http://localhost"
    headers["X-Title"] = "NeuradventureV2"
    headers["X-OpenRouter-Title"] = "NeuradventureV2"
  }
  return headers
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
  return { id, ...(name ? { name } : {}), ...(ctx ? { context_length: ctx } : {}) }
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
  const url = buildModelsUrl(connector)
  const res = await fetch(url, { headers: buildUpstreamHeaders(connector) })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`Upstream /models failed (${res.status}): ${text || res.statusText}`)
  }
  const payload = (await res.json()) as unknown
  return parseModelsPayload(payload)
}

export async function getCachedUpstreamModels(connector: LLMConnector): Promise<UpstreamModelInfo[]> {
  const key = cacheKey(connector)
  const now = Date.now()
  const cached = modelsCache.get(key)
  if (cached && now - cached.fetchedAt < MODELS_CACHE_TTL_MS) return cached.models

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
