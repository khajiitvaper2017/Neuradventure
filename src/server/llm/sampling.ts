import type { GenerationParams } from "../core/db.js"

export function buildSamplingParams(
  gen: GenerationParams,
  maxTokensOverride?: number,
  options: { disableRepetition?: boolean } = {},
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    max_tokens: maxTokensOverride ?? gen.max_tokens,
    temperature: gen.temperature,
  }

  const repeatPenalty = options.disableRepetition ? 1.0 : gen.repeat_penalty
  const repeatLastN = options.disableRepetition ? 0 : gen.repeat_last_n
  const dryMultiplier = options.disableRepetition ? 0.0 : gen.dry_multiplier

  // Only include non-default params to keep the request clean
  if (gen.top_k !== 40) params.top_k = gen.top_k
  if (gen.top_p !== 0.95) params.top_p = gen.top_p
  if (gen.min_p !== 0.05) params.min_p = gen.min_p
  if (gen.typical_p !== 1.0) params.typical_p = gen.typical_p
  if (gen.top_n_sigma !== -1.0) params.top_n_sigma = gen.top_n_sigma
  if (repeatPenalty !== 1.0) params.repeat_penalty = repeatPenalty
  if (repeatLastN !== 64) params.repeat_last_n = repeatLastN
  if (gen.presence_penalty !== 0.0) params.presence_penalty = gen.presence_penalty
  if (gen.frequency_penalty !== 0.0) params.frequency_penalty = gen.frequency_penalty
  if (gen.mirostat !== 0) {
    params.mirostat = gen.mirostat
    params.mirostat_tau = gen.mirostat_tau
    params.mirostat_eta = gen.mirostat_eta
  }
  if (gen.dynatemp_range !== 0.0) {
    params.dynatemp_range = gen.dynatemp_range
    params.dynatemp_exponent = gen.dynatemp_exponent
  }
  if (dryMultiplier !== 0.0) {
    params.dry_multiplier = dryMultiplier
    params.dry_base = gen.dry_base
    params.dry_allowed_length = gen.dry_allowed_length
    params.dry_penalty_last_n = gen.dry_penalty_last_n
  }
  if (gen.xtc_probability !== 0.0) {
    params.xtc_probability = gen.xtc_probability
    params.xtc_threshold = gen.xtc_threshold
  }
  if (gen.seed !== -1) params.seed = gen.seed

  return params
}
