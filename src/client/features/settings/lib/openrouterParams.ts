import type { GenerationParams } from "../../../api/client.js"
import type { ModelInfo } from "../../../api/client.js"

export type OpenRouterParamStatus = "supported" | "unsupported" | "unknown" | "not_sent"
type OpenRouterSupportedParam = string | string[]

// Map GenerationParams keys to OpenRouter supported_parameters names.
// Keys not in this map are not sent to OpenRouter by the server connector.
export const PARAM_TO_OPENROUTER: Partial<Record<keyof GenerationParams, OpenRouterSupportedParam>> = {
  // Server sends both; model may support either.
  max_tokens: ["max_completion_tokens", "max_tokens"],
  temperature: "temperature",
  top_k: "top_k",
  top_p: "top_p",
  min_p: "min_p",
  top_a: "top_a",
  seed: "seed",
  presence_penalty: "presence_penalty",
  frequency_penalty: "frequency_penalty",
  repeat_penalty: "repetition_penalty",
  logit_bias: "logit_bias",
}

function coerceToArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value]
}

export function getOpenRouterParamStatus(key: keyof GenerationParams, model: ModelInfo | null): OpenRouterParamStatus {
  const mapped = PARAM_TO_OPENROUTER[key]
  if (!mapped) return "not_sent"
  if (!model?.supported_parameters || model.supported_parameters.length === 0) return "unknown"
  const candidates = coerceToArray(mapped)
  const ok = candidates.some((p) => model.supported_parameters!.includes(p))
  return ok ? "supported" : "unsupported"
}
