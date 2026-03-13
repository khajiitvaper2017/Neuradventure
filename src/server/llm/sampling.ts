import type { GenerationParams } from "../core/db.js"
import { getCtxLimitCached } from "./client.js"

export function buildSamplingParams(
  gen: GenerationParams,
  maxTokensOverride?: number,
  options: { disableRepetition?: boolean } = {},
): Record<string, unknown> {
  const ctxLimit = getCtxLimitCached()

  const repeatPenalty = options.disableRepetition ? 1.0 : gen.repeat_penalty
  const repeatLastN = options.disableRepetition ? 0 : gen.repeat_last_n
  const repPenRange = repeatLastN === -1 ? (ctxLimit > 0 ? ctxLimit : null) : Math.max(0, Math.floor(repeatLastN))

  const dryMultiplier = options.disableRepetition ? 0.0 : gen.dry_multiplier
  const dryPenaltyLastN = gen.dry_penalty_last_n
  const dryRange = dryPenaltyLastN === -1 ? (ctxLimit > 0 ? ctxLimit : null) : Math.max(0, Math.floor(dryPenaltyLastN))

  const samplerOrder = Array.isArray(gen.sampler_order)
    ? gen.sampler_order.map((n) => Math.floor(n)).filter((n) => Number.isFinite(n))
    : []

  const params: Record<string, unknown> = {
    // OpenAI-compatible (KoboldCpp translates these)
    max_tokens: maxTokensOverride ?? gen.max_tokens,
    temperature: gen.temperature,
    top_k: gen.top_k,
    top_p: gen.top_p,
    min_p: gen.min_p,
    seed: gen.seed,
    presence_penalty: gen.presence_penalty,
    frequency_penalty: gen.frequency_penalty,

    // KoboldCpp-native sampler keys
    top_a: gen.top_a,
    typical: gen.typical_p,
    tfs: gen.tfs,
    nsigma: gen.top_n_sigma === -1 ? 0.0 : gen.top_n_sigma,
    rep_pen: repeatPenalty,
    rep_pen_slope: gen.rep_pen_slope,
    mirostat_mode: gen.mirostat,
    mirostat_tau: gen.mirostat_tau,
    mirostat_eta: gen.mirostat_eta,
    dynatemp_range: gen.dynatemp_range,
    dynatemp_exponent: gen.dynatemp_exponent,
    smoothing_factor: gen.smoothing_factor,
    smoothing_curve: gen.smoothing_curve,
    adaptive_target: gen.adaptive_target,
    adaptive_decay: gen.adaptive_decay,
    dry_multiplier: dryMultiplier,
    dry_base: gen.dry_base,
    dry_allowed_length: gen.dry_allowed_length,
    xtc_probability: gen.xtc_probability,
    xtc_threshold: gen.xtc_threshold,
    ban_eos_token: gen.ban_eos_token,
    sampler_order: samplerOrder,
    dry_sequence_breakers: gen.dry_sequence_breakers,
    banned_tokens: gen.banned_tokens,
    logit_bias: gen.logit_bias,
    render_special: gen.render_special,
  }

  if (repPenRange !== null) params.rep_pen_range = repPenRange
  if (dryRange !== null) params.dry_penalty_last_n = dryRange

  return params
}
