import type { GenerationParams, LLMConnector, ModelInfo } from "@/types/api"
import { getOpenRouterParamStatus, type OpenRouterParamStatus } from "@/features/settings/lib/openrouterParams"

export type ParamBadge = { label: string; kind: "warning" | "neutral" }

export function getSelectedModel(connector: LLMConnector, models: ModelInfo[]): ModelInfo | null {
  if (connector.type !== "openrouter") return null
  return models.find((m) => m.id === connector.model) ?? null
}

export function paramStatus(
  key: keyof GenerationParams,
  connector: LLMConnector,
  models: ModelInfo[],
): OpenRouterParamStatus {
  if (connector.type !== "openrouter") return "supported"
  return getOpenRouterParamStatus(key, getSelectedModel(connector, models))
}

export function badgeForStatus(status: OpenRouterParamStatus): ParamBadge | null {
  if (status === "unsupported") return { label: "ignored", kind: "warning" }
  if (status === "not_sent") return { label: "kobold-only", kind: "neutral" }
  return null
}

export function titleForStatus(status: OpenRouterParamStatus): string {
  if (status === "unsupported") return "This parameter is not supported by the selected OpenRouter model"
  if (status === "not_sent") return "This parameter is KoboldCpp-only and is not sent to OpenRouter"
  if (status === "unknown")
    return "Model parameter metadata is not available; this parameter may be ignored by OpenRouter"
  return ""
}

export function keyMeta(
  key: keyof GenerationParams,
  connector: LLMConnector,
  models: ModelInfo[],
): { status: OpenRouterParamStatus; badge: ParamBadge | null; title: string } {
  const status = paramStatus(key, connector, models)
  return { status, badge: badgeForStatus(status), title: titleForStatus(status) }
}
