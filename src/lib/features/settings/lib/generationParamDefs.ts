import type { GenerationParams } from "@/types/api"

export type ParamDef = {
  key: keyof GenerationParams
  label: string
  sub: string
  min?: number
  max?: number
  step?: number
  int?: boolean
}

export const samplingParams: ParamDef[] = [
  {
    key: "max_tokens",
    label: "Max Tokens",
    sub: "Maximum tokens to generate per request",
    min: 1,
    max: 8192,
    step: 1,
    int: true,
  },
  {
    key: "temperature",
    label: "Temperature",
    sub: "Controls randomness (0 = deterministic)",
    min: 0,
    max: 5,
    step: 0.05,
  },
  { key: "tfs", label: "TFS", sub: "Tail free sampling (1.0 = disabled)", min: 0, max: 1, step: 0.01 },
  { key: "top_p", label: "Top-P (Nucleus)", sub: "Cumulative probability threshold", min: 0, max: 1, step: 0.01 },
  {
    key: "top_k",
    label: "Top-K",
    sub: "Keep only K most probable tokens (0 = disabled)",
    min: 0,
    max: 1000,
    step: 1,
    int: true,
  },
  { key: "top_a", label: "Top-A", sub: "Top-a sampling (0 = disabled)", min: 0, max: 1, step: 0.01 },
  {
    key: "min_p",
    label: "Min-P",
    sub: "Minimum probability relative to most likely token",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "typical_p",
    label: "Typical-P",
    sub: "Locally typical sampling (1.0 = disabled)",
    min: 0,
    max: 1,
    step: 0.01,
  },
  {
    key: "top_n_sigma",
    label: "Top-N Sigma",
    sub: "Standard deviations above mean (-1 = disabled)",
    min: -1,
    max: 10,
    step: 0.1,
  },
]

export const repetitionParams: ParamDef[] = [
  {
    key: "repeat_penalty",
    label: "Repeat Penalty",
    sub: "Penalty for repeating tokens (1.0 = disabled)",
    min: 0,
    max: 3,
    step: 0.05,
  },
  {
    key: "presence_penalty",
    label: "Presence Penalty",
    sub: "Penalty if token appeared at all (0 = disabled)",
    min: -2,
    max: 2,
    step: 0.05,
  },
  {
    key: "frequency_penalty",
    label: "Frequency Penalty",
    sub: "Penalty based on token count (0 = disabled)",
    min: -2,
    max: 2,
    step: 0.05,
  },
  {
    key: "repeat_last_n",
    label: "Repeat Penalty Range",
    sub: "Tokens to scan for repeats (-1 = context, 0 = off)",
    min: -1,
    max: 4096,
    step: 1,
    int: true,
  },
  {
    key: "rep_pen_slope",
    label: "Repeat Penalty Slope",
    sub: "Scales penalty on older tokens (1.0 = full, 0 = near-only)",
    min: 0,
    max: 1,
    step: 0.01,
  },
]

export const mirostatParams: ParamDef[] = [
  {
    key: "mirostat",
    label: "Mirostat Mode",
    sub: "0 = off, 1 = Mirostat, 2 = Mirostat 2.0",
    min: 0,
    max: 2,
    step: 1,
    int: true,
  },
  { key: "mirostat_tau", label: "Mirostat Tau", sub: "Target entropy", min: 0, max: 20, step: 0.1 },
  { key: "mirostat_eta", label: "Mirostat Eta", sub: "Learning rate", min: 0, max: 1, step: 0.01 },
]

export const dynatempParams: ParamDef[] = [
  {
    key: "dynatemp_range",
    label: "Dynamic Temp Range",
    sub: "Temperature variation range (0 = disabled)",
    min: 0,
    max: 5,
    step: 0.05,
  },
  {
    key: "dynatemp_exponent",
    label: "Dynamic Temp Exponent",
    sub: "Exponent for entropy mapping",
    min: 0.1,
    max: 5,
    step: 0.1,
  },
]

export const dryParams: ParamDef[] = [
  {
    key: "dry_multiplier",
    label: "DRY Multiplier",
    sub: "Diverse repetition penalty strength (0 = disabled)",
    min: 0,
    max: 5,
    step: 0.05,
  },
  {
    key: "dry_penalty_last_n",
    label: "DRY Penalty Range",
    sub: "Tokens to scan (-1 = context, 0 = off)",
    min: -1,
    max: 4096,
    step: 1,
    int: true,
  },
  { key: "dry_base", label: "DRY Base", sub: "Base multiplier for penalty", min: 1, max: 4, step: 0.05 },
  {
    key: "dry_allowed_length",
    label: "DRY Allowed Length",
    sub: "Repetitions up to this length are allowed",
    min: 0,
    max: 20,
    step: 1,
    int: true,
  },
]

export const xtcParams: ParamDef[] = [
  {
    key: "xtc_probability",
    label: "XTC Probability",
    sub: "Chance of applying token cutting (0 = disabled)",
    min: 0,
    max: 1,
    step: 0.05,
  },
  {
    key: "xtc_threshold",
    label: "XTC Threshold",
    sub: "Token probability threshold (>0.5 disables)",
    min: 0,
    max: 1,
    step: 0.05,
  },
]

export const otherParams: ParamDef[] = [
  {
    key: "ctx_limit",
    label: "Ctx Limit",
    sub: "Max prompt tokens before compressing history (0 = off)",
    min: 0,
    max: 32768,
    step: 1,
    int: true,
  },
  {
    key: "seed",
    label: "Seed",
    sub: "Random seed (-1 = random each call)",
    min: -1,
    max: 2147483647,
    step: 1,
    int: true,
  },
]
