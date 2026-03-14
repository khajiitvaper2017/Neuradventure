import type { GenerationParams } from "../../../api/client.js"

// Map GenerationParams keys to OpenRouter supported_parameters names.
// Parameters not in this map are KoboldCpp-only and won't be sent to OpenRouter.
export const PARAM_TO_OPENROUTER: Partial<Record<keyof GenerationParams, string>> = {
  max_tokens: "max_tokens",
  temperature: "temperature",
  top_p: "top_p",
  seed: "seed",
  presence_penalty: "presence_penalty",
  frequency_penalty: "frequency_penalty",
  repeat_penalty: "repetition_penalty",
  logit_bias: "logit_bias",
}
