<script lang="ts">
  import { onMount } from "svelte"
  import { navigate } from "../../stores/ui.js"
  import { api } from "../../api/client.js"
  import {
    theme,
    design,
    textJustify,
    colorScheme,
    defaultAuthorNote,
    defaultAuthorNoteDepth,
    storyDefaults,
    connector,
    generation,
    ctxLimitDetected,
  } from "../../stores/settings.js"
  import type { GenerationParams, PromptConfigFile, SamplerPreset, StoryModules } from "../../api/client.js"
  import { presets, loadPresets, refreshPresets } from "../../utils/presets.js"
  import StoryModulesPanel from "../../components/ui/StoryModulesPanel.svelte"

  type SettingsTab = "appearance" | "generation" | "prompts" | "modules"
  const SETTINGS_TAB_KEY = "settings_active_tab"

  function loadInitialTab(): SettingsTab {
    if (typeof window === "undefined") return "appearance"
    try {
      const stored = window.localStorage.getItem(SETTINGS_TAB_KEY)
      if (stored === "generation") return "generation"
      if (stored === "prompts") return "prompts"
      if (stored === "modules") return "modules"
      return "appearance"
    } catch {
      return "appearance"
    }
  }

  let activeTab: SettingsTab = $state(loadInitialTab())

  onMount(() => {
    void loadPresets()
  })

  $effect(() => {
    if (typeof window === "undefined") return
    try {
      window.localStorage.setItem(SETTINGS_TAB_KEY, activeTab)
    } catch {
      // Ignore storage failures (e.g., privacy mode).
    }
  })

  // Local copies for text inputs (committed on blur/enter)
  let connectorUrl = $state($connector.url)
  let connectorApiKey = $state($connector.api_key)
  let authorNoteDraft = $state($defaultAuthorNote)
  let authorNoteDepthDraft = $state($defaultAuthorNoteDepth)
  let samplerOrderDraft = $state(formatSamplerOrder($generation.sampler_order))
  let dryBreakersDraft = $state(JSON.stringify($generation.dry_sequence_breakers, null, 2))
  let bannedTokensDraft = $state($generation.banned_tokens.join("\n"))
  let logitBiasDraft = $state(JSON.stringify($generation.logit_bias, null, 2))

  let importFileInput: HTMLInputElement | null = $state(null)

  // Sync local copies when store changes externally
  $effect(() => {
    connectorUrl = $connector.url
  })
  $effect(() => {
    connectorApiKey = $connector.api_key
  })
  $effect(() => {
    authorNoteDraft = $defaultAuthorNote
  })
  $effect(() => {
    authorNoteDepthDraft = $defaultAuthorNoteDepth
  })
  $effect(() => {
    samplerOrderDraft = formatSamplerOrder($generation.sampler_order)
  })
  $effect(() => {
    dryBreakersDraft = JSON.stringify($generation.dry_sequence_breakers, null, 2)
  })
  $effect(() => {
    bannedTokensDraft = $generation.banned_tokens.join("\n")
  })
  $effect(() => {
    logitBiasDraft = JSON.stringify($generation.logit_bias, null, 2)
  })

  function commitConnector() {
    const trimmedUrl = connectorUrl.trim()
    const trimmedKey = connectorApiKey.trim()
    if (trimmedUrl !== $connector.url || trimmedKey !== $connector.api_key) {
      connector.set({ ...$connector, url: trimmedUrl, api_key: trimmedKey })
    }
  }

  function commitAuthorNote() {
    const trimmedNote = authorNoteDraft.trim()
    const nextDepthRaw = Number(authorNoteDepthDraft)
    const nextDepth = Number.isFinite(nextDepthRaw) ? Math.min(100, Math.max(0, Math.floor(nextDepthRaw))) : 4
    if (trimmedNote !== $defaultAuthorNote) {
      defaultAuthorNote.set(trimmedNote)
    }
    if (nextDepth !== $defaultAuthorNoteDepth) {
      defaultAuthorNoteDepth.set(nextDepth)
    }
  }

  function setStoryDefaults(next: StoryModules) {
    storyDefaults.set(next)
  }

  // ── Presets ──────────────────────────────────────────
  function detectPreset(gen: GenerationParams, list: SamplerPreset[]): string {
    for (const preset of list) {
      const match = (Object.keys(preset.params) as (keyof GenerationParams)[]).every((k) => gen[k] === preset.params[k])
      if (match) return preset.name
    }
    return "Custom"
  }

  let activePreset = $derived(detectPreset($generation, $presets))

  function applyPreset(name: string) {
    const preset = $presets.find((p: SamplerPreset) => p.name === name)
    if (preset) generation.set({ ...preset.params })
  }

  function setGen<K extends keyof GenerationParams>(key: K, value: GenerationParams[K]) {
    generation.set({ ...$generation, [key]: value })
  }

  function handleNumInput(key: keyof GenerationParams, e: Event, isInt = false) {
    const input = e.target as HTMLInputElement
    const raw = input.value.trim()
    if (raw === "" || raw === "-") return
    const val = isInt ? parseInt(raw, 10) : parseFloat(raw)
    if (!isNaN(val)) setGen(key, val)
  }

  function formatSamplerOrder(order: GenerationParams["sampler_order"]): string {
    if (!Array.isArray(order)) return ""
    return order.join(", ")
  }

  function parseSamplerOrder(text: string): number[] | null {
    const trimmed = text.trim()
    if (!trimmed) return []
    const parts = trimmed
      .split(",")
      .map((p) => p.trim())
      .filter(Boolean)
    const out: number[] = []
    for (const p of parts) {
      const n = Number(p)
      if (!Number.isFinite(n)) return null
      out.push(Math.trunc(n))
    }
    return out
  }

  function commitSamplerOrder() {
    const parsed = parseSamplerOrder(samplerOrderDraft)
    if (!parsed) {
      samplerOrderDraft = formatSamplerOrder($generation.sampler_order)
      return
    }
    if (JSON.stringify(parsed) !== JSON.stringify($generation.sampler_order)) {
      setGen("sampler_order", parsed)
    }
  }

  function commitDryBreakers() {
    const trimmed = dryBreakersDraft.trim()
    if (!trimmed) {
      setGen("dry_sequence_breakers", [])
      return
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (!Array.isArray(parsed) || !parsed.every((v) => typeof v === "string")) throw new Error("Invalid array")
      setGen("dry_sequence_breakers", parsed)
    } catch {
      dryBreakersDraft = JSON.stringify($generation.dry_sequence_breakers, null, 2)
    }
  }

  function commitBannedTokens() {
    const list = bannedTokensDraft
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0)
    setGen("banned_tokens", list)
  }

  function commitLogitBias() {
    const trimmed = logitBiasDraft.trim()
    if (!trimmed) {
      setGen("logit_bias", {})
      return
    }
    try {
      const parsed = JSON.parse(trimmed) as unknown
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid object")
      const obj = parsed as Record<string, unknown>
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(obj)) {
        const n = typeof v === "number" ? v : typeof v === "string" ? Number(v.trim()) : NaN
        if (!Number.isFinite(n)) continue
        out[k] = n
      }
      setGen("logit_bias", out)
    } catch {
      logitBiasDraft = JSON.stringify($generation.logit_bias, null, 2)
    }
  }

  function filenameToPresetName(file: File): string {
    const name = file.name.replace(/\.[^.]+$/, "").trim()
    return name || "Imported Preset"
  }

  function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value)
  }

  function asNumber(value: unknown): number | undefined {
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      const n = Number(value.trim())
      return Number.isFinite(n) ? n : undefined
    }
    return undefined
  }

  function asInt(value: unknown): number | undefined {
    const n = asNumber(value)
    return n === undefined ? undefined : Math.trunc(n)
  }

  function asBool(value: unknown): boolean | undefined {
    if (typeof value === "boolean") return value
    if (value === 0) return false
    if (value === 1) return true
    if (typeof value === "string") {
      const v = value.trim().toLowerCase()
      if (v === "true") return true
      if (v === "false") return false
    }
    return undefined
  }

  function parseStringArray(value: unknown): string[] | undefined {
    if (Array.isArray(value) && value.every((v) => typeof v === "string")) return value
    if (typeof value === "string") {
      try {
        const parsed = JSON.parse(value) as unknown
        if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) return parsed
      } catch {
        // ignore
      }
    }
    return undefined
  }

  function parseLogitBias(value: unknown): Record<string, number> | undefined {
    if (isRecord(value)) {
      const out: Record<string, number> = {}
      for (const [k, v] of Object.entries(value)) {
        const n = asNumber(v)
        if (n === undefined) continue
        out[k] = n
      }
      return out
    }
    if (Array.isArray(value)) {
      const out: Record<string, number> = {}
      for (const item of value) {
        if (!isRecord(item)) continue
        const id = item.id ?? item.token_id ?? item.tokenId ?? item.key
        const bias = item.bias ?? item.value
        const idStr = typeof id === "string" ? id : typeof id === "number" ? String(Math.trunc(id)) : null
        const n = asNumber(bias)
        if (!idStr || n === undefined) continue
        out[idStr] = n
      }
      return out
    }
    return undefined
  }

  function coercePresetFromJson(raw: unknown, fallbackName: string): Omit<SamplerPreset, "id"> | null {
    if (isRecord(raw) && typeof raw.name === "string" && isRecord(raw.params)) {
      const base: GenerationParams = { ...$generation }
      const params = { ...base, ...(raw.params as Partial<GenerationParams>) }
      return {
        name: raw.name.trim() || fallbackName,
        description: typeof raw.description === "string" ? raw.description : "",
        params,
      }
    }

    if (!isRecord(raw)) return null

    const temp = asNumber(raw.temp)
    const repPen = asNumber(raw.rep_pen)
    const isSillyTavernish = temp !== undefined || repPen !== undefined || asNumber(raw.top_p) !== undefined
    if (!isSillyTavernish) return null

    const params: GenerationParams = { ...$generation }

    const genamt = asInt(raw.genamt)
    if (genamt !== undefined && genamt > 0) params.max_tokens = genamt
    const maxTokens = asInt(raw.max_tokens)
    if (maxTokens !== undefined && maxTokens > 0) params.max_tokens = maxTokens

    if (temp !== undefined) params.temperature = temp
    const topK = asInt(raw.top_k)
    if (topK !== undefined) params.top_k = topK
    const topP = asNumber(raw.top_p)
    if (topP !== undefined) params.top_p = topP
    const topA = asNumber(raw.top_a)
    if (topA !== undefined) params.top_a = topA
    const minP = asNumber(raw.min_p)
    if (minP !== undefined) params.min_p = minP

    const typical = asNumber(raw.typical_p ?? raw.typical)
    if (typical !== undefined) params.typical_p = typical
    const tfs = asNumber(raw.tfs)
    if (tfs !== undefined) params.tfs = tfs
    const nsigma = asNumber(raw.nsigma)
    if (nsigma !== undefined) params.top_n_sigma = nsigma <= 0 ? -1.0 : nsigma

    if (repPen !== undefined) params.repeat_penalty = repPen
    const repPenRange = asInt(raw.rep_pen_range)
    if (repPenRange !== undefined) params.repeat_last_n = repPenRange
    const repPenSlope = asNumber(raw.rep_pen_slope)
    if (repPenSlope !== undefined) params.rep_pen_slope = repPenSlope

    const presence = asNumber(raw.presence_pen ?? raw.presence_penalty)
    if (presence !== undefined) params.presence_penalty = presence
    const freq = asNumber(raw.freq_pen ?? raw.frequency_penalty)
    if (freq !== undefined) params.frequency_penalty = freq

    const mirostatMode = asInt(raw.mirostat_mode ?? raw.mirostat)
    if (mirostatMode !== undefined) params.mirostat = mirostatMode
    const miroTau = asNumber(raw.mirostat_tau)
    if (miroTau !== undefined) params.mirostat_tau = miroTau
    const miroEta = asNumber(raw.mirostat_eta)
    if (miroEta !== undefined) params.mirostat_eta = miroEta

    const dynRange = asNumber(raw.dynatemp_range)
    if (dynRange !== undefined) {
      params.dynatemp_range = dynRange
    } else {
      const dynatemp = asBool(raw.dynatemp)
      const minTemp = asNumber(raw.min_temp)
      const maxTemp = asNumber(raw.max_temp)
      if (dynatemp && minTemp !== undefined && maxTemp !== undefined)
        params.dynatemp_range = Math.max(0.0, maxTemp - minTemp)
      if (dynatemp === false) params.dynatemp_range = 0.0
    }
    const dynExp = asNumber(raw.dynatemp_exponent)
    if (dynExp !== undefined) params.dynatemp_exponent = dynExp

    const smoothingFactor = asNumber(raw.smoothing_factor)
    if (smoothingFactor !== undefined) params.smoothing_factor = smoothingFactor
    const smoothingCurve = asNumber(raw.smoothing_curve)
    if (smoothingCurve !== undefined) params.smoothing_curve = smoothingCurve

    const adaptiveTarget = asNumber(raw.adaptive_target)
    if (adaptiveTarget !== undefined) params.adaptive_target = adaptiveTarget
    const adaptiveDecay = asNumber(raw.adaptive_decay)
    if (adaptiveDecay !== undefined) params.adaptive_decay = adaptiveDecay

    const dryMult = asNumber(raw.dry_multiplier)
    if (dryMult !== undefined) params.dry_multiplier = dryMult
    const dryBase = asNumber(raw.dry_base)
    if (dryBase !== undefined) params.dry_base = dryBase
    const dryAllowed = asInt(raw.dry_allowed_length)
    if (dryAllowed !== undefined) params.dry_allowed_length = dryAllowed
    const dryPenalty = asInt(raw.dry_penalty_last_n)
    if (dryPenalty !== undefined) params.dry_penalty_last_n = dryPenalty
    const breakers = parseStringArray(raw.dry_sequence_breakers)
    if (breakers) params.dry_sequence_breakers = breakers

    const xtcProb = asNumber(raw.xtc_probability)
    if (xtcProb !== undefined) params.xtc_probability = xtcProb
    const xtcThr = asNumber(raw.xtc_threshold)
    if (xtcThr !== undefined) params.xtc_threshold = xtcThr

    const banEos = asBool(raw.ban_eos_token)
    if (banEos !== undefined) params.ban_eos_token = banEos
    const renderSpecial = asBool(raw.render_special)
    if (renderSpecial !== undefined) params.render_special = renderSpecial

    const order = raw.sampler_order
    if (Array.isArray(order) && order.every((v) => typeof v === "number" && Number.isFinite(v))) {
      params.sampler_order = order.map((n) => Math.trunc(n))
    }

    const bannedTokens = parseStringArray(raw.banned_tokens ?? raw.banned_strings)
    if (bannedTokens) params.banned_tokens = bannedTokens

    const logitBias = parseLogitBias(raw.logit_bias)
    if (logitBias) params.logit_bias = logitBias

    const seed = asInt(raw.seed ?? raw.sampler_seed)
    if (seed !== undefined) params.seed = seed

    return {
      name: typeof raw.preset === "string" && raw.preset.trim() ? raw.preset.trim() : fallbackName,
      description: typeof raw.description === "string" ? raw.description : "Imported preset",
      params,
    }
  }

  async function handleImportPresetJson(e: Event) {
    const input = e.target as HTMLInputElement
    const file = input.files?.[0]
    input.value = ""
    if (!file) return
    try {
      const text = await file.text()
      const raw = JSON.parse(text) as unknown
      const fallbackName = filenameToPresetName(file)
      const preset = coercePresetFromJson(raw, fallbackName)
      if (!preset) throw new Error("Unrecognized preset JSON format")

      generation.set({ ...preset.params })
      await api.settings.upsertPreset({
        name: preset.name,
        description: preset.description,
        params: preset.params,
      })
      await refreshPresets()
    } catch (err) {
      console.error("[presets] Failed to import preset JSON", err)
    }
  }

  function openImportPreset() {
    importFileInput?.click()
  }

  async function deletePreset(preset: SamplerPreset) {
    if (!preset.id) return
    if (typeof window !== "undefined") {
      const ok = window.confirm(`Delete preset "${preset.name}"?`)
      if (!ok) return
    }
    try {
      await api.settings.deletePreset(preset.id)
      await refreshPresets()
    } catch (err) {
      console.error("[presets] Failed to delete preset", err)
    }
  }

  // ── Prompt config (server-stored, user editable) ───────────
  const PROMPT_LABELS: Record<PromptConfigFile["name"], string> = {
    "narrative-turn": "Narrative Turn",
    "character-generation": "Character Generation",
    "story-setup": "Story Setup",
    "chat-mode": "Chat Mode",
    "npc-creation": "NPC Creation",
    "player-impersonation": "Player Impersonation",
  }

  let promptFiles = $state<PromptConfigFile[]>([])
  let promptSelected = $state<PromptConfigFile["name"]>("narrative-turn")
  let promptDraft = $state<string>("")
  let promptDirty = $state(false)
  let promptLoading = $state(false)
  let promptSaving = $state(false)
  let promptError = $state<string | null>(null)
  let promptSelectedRow = $derived(promptFiles.find((p) => p.name === promptSelected) ?? null)

  async function loadPromptFiles(options?: { preserveSelection?: boolean }) {
    if (promptLoading) return
    const prevSelected = options?.preserveSelection ? promptSelected : null
    promptLoading = true
    promptError = null
    try {
      const rows = await api.settings.promptConfigs()
      promptFiles = rows
      const preferred = prevSelected && rows.some((r) => r.name === prevSelected) ? prevSelected : null
      const nextName = preferred ?? rows[0]?.name ?? null
      if (nextName) {
        promptSelected = nextName
        const row = rows.find((r) => r.name === nextName)
        promptDraft = row?.config_json ?? ""
        promptDirty = false
      } else {
        promptDraft = ""
        promptDirty = false
      }
    } catch (err) {
      console.error("[prompts] Failed to load prompt configs", err)
      promptError = "Failed to load prompt configs."
    } finally {
      promptLoading = false
    }
  }

  function selectPromptFile(name: PromptConfigFile["name"]) {
    if (name === promptSelected) return
    if (promptDirty && typeof window !== "undefined") {
      const ok = window.confirm("Discard unsaved prompt changes?")
      if (!ok) return
    }
    promptError = null
    promptDirty = false
    promptSelected = name
    const row = promptFiles.find((p) => p.name === name)
    promptDraft = row?.config_json ?? ""
  }

  async function savePromptFile() {
    if (promptSaving) return
    promptError = null
    try {
      JSON.parse(promptDraft)
    } catch (err) {
      promptError = err instanceof Error ? err.message : "Invalid JSON"
      return
    }
    promptSaving = true
    try {
      const updated = await api.settings.updatePromptConfig(promptSelected, promptDraft)
      promptFiles = promptFiles.map((p) => (p.name === updated.name ? updated : p))
      promptDraft = updated.config_json
      promptDirty = false
    } catch (err) {
      console.error("[prompts] Failed to save prompt config", err)
      promptError = err instanceof Error ? err.message : "Failed to save prompt config."
    } finally {
      promptSaving = false
    }
  }

  async function resetPromptFile() {
    if (promptSaving) return
    if (typeof window !== "undefined") {
      const ok = window.confirm("Reset this prompt config to the built-in defaults?")
      if (!ok) return
    }
    promptSaving = true
    promptError = null
    try {
      const updated = await api.settings.resetPromptConfig(promptSelected)
      promptFiles = promptFiles.map((p) => (p.name === updated.name ? updated : p))
      promptDraft = updated.config_json
      promptDirty = false
    } catch (err) {
      console.error("[prompts] Failed to reset prompt config", err)
      promptError = err instanceof Error ? err.message : "Failed to reset prompt config."
    } finally {
      promptSaving = false
    }
  }

  async function resetAllPromptFiles() {
    if (promptSaving) return
    if (typeof window !== "undefined") {
      const ok = window.confirm(
        "Reset ALL prompt templates to built-in defaults? This will overwrite all prompt edits.",
      )
      if (!ok) return
    }
    promptSaving = true
    promptError = null
    promptDirty = false
    try {
      await api.settings.resetAllPromptConfigs()
      await loadPromptFiles({ preserveSelection: true })
    } catch (err) {
      console.error("[prompts] Failed to reset all prompt configs", err)
      promptError = err instanceof Error ? err.message : "Failed to reset all prompt configs."
    } finally {
      promptSaving = false
    }
  }

  function formatPromptDraft() {
    promptError = null
    try {
      const parsed = JSON.parse(promptDraft) as unknown
      promptDraft = JSON.stringify(parsed, null, 2)
      promptDirty = true
    } catch (err) {
      promptError = err instanceof Error ? err.message : "Invalid JSON"
    }
  }

  $effect(() => {
    if (activeTab !== "prompts") return
    if (promptFiles.length > 0) return
    void loadPromptFiles()
  })

  $effect(() => {
    if (promptFiles.length === 0) return
    const row = promptFiles.find((p) => p.name === promptSelected) ?? promptFiles[0]
    if (!row) return
    if (row.name !== promptSelected) promptSelected = row.name
    if (!promptDirty) promptDraft = row.config_json
  })

  type ParamDef = {
    key: keyof GenerationParams
    label: string
    sub: string
    min?: number
    max?: number
    step?: number
    int?: boolean
  }

  const samplingParams: ParamDef[] = [
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

  const repetitionParams: ParamDef[] = [
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

  const mirostatParams: ParamDef[] = [
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

  const dynatempParams: ParamDef[] = [
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

  const dryParams: ParamDef[] = [
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

  const xtcParams: ParamDef[] = [
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

  const otherParams: ParamDef[] = [
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
</script>

<div class="screen settings">
  <header class="screen-header">
    <button class="back-btn" onclick={() => navigate("home")}>← Back</button>
    <h2 class="screen-title">Settings</h2>
  </header>

  <nav class="tabs">
    <button class="tab" class:active={activeTab === "appearance"} onclick={() => (activeTab = "appearance")}>
      Appearance
    </button>
    <button class="tab" class:active={activeTab === "generation"} onclick={() => (activeTab = "generation")}>
      Text Generation
    </button>
    <button class="tab" class:active={activeTab === "prompts"} onclick={() => (activeTab = "prompts")}>
      Prompts
    </button>
    <button class="tab" class:active={activeTab === "modules"} onclick={() => (activeTab = "modules")}>
      Story Modules
    </button>
  </nav>

  <div class="list" data-scroll-root="screen">
    {#if activeTab === "appearance"}
      <!-- Theme section -->
      <div class="section-label">Theme</div>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Theme</span>
          <span class="row-sub">Overall background tone</span>
        </span>
        <select class="select-input" bind:value={$theme}>
          <option value="default">Default — Dark gray background</option>
          <option value="amoled">AMOLED — Pure black (OLED)</option>
        </select>
      </label>

      <div class="divider"></div>

      <!-- Design section -->
      <div class="section-label">Typography</div>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Typography</span>
          <span class="row-sub">Fonts for story and UI</span>
        </span>
        <select class="select-input" bind:value={$design}>
          <option value="classic">Classic — Spectral + DM Sans</option>
          <option value="roboto">Roboto — clean sans-serif</option>
        </select>
      </label>

      <div class="divider"></div>

      <!-- Color scheme section -->
      <div class="section-label">Color Scheme</div>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Accent</span>
          <span class="row-sub">Highlight color for buttons and UI</span>
        </span>
        <select class="select-input" bind:value={$colorScheme}>
          <option value="gold">Gold — Warm, classic accent</option>
          <option value="emerald">Emerald — Cool green accent</option>
          <option value="sapphire">Sapphire — Blue with strong contrast</option>
          <option value="crimson">Crimson — Bold red accent</option>
        </select>
      </label>

      <div class="divider"></div>

      <!-- Text layout -->
      <div class="section-label">Text Layout</div>

      <label class="row">
        <span class="row-text">
          <span class="row-title">Justify text</span>
          <span class="row-sub">Align paragraph edges for a book-like look</span>
        </span>
        <input type="checkbox" bind:checked={$textJustify} />
      </label>
    {:else if activeTab === "generation"}
      <!-- Connection -->
      <div class="section-label">Connection</div>

      <div class="row row-input">
        <span class="row-text">
          <span class="row-title">Backend</span>
          <span class="row-sub">KoboldCpp (OpenAI-compatible)</span>
        </span>
        <span class="connector-badge">{$connector.type}</span>
      </div>

      <div class="row row-input">
        <span class="row-text">
          <span class="row-title">Ctx Limit (Detected)</span>
          <span class="row-sub">Fetched from KoboldCpp on server start</span>
        </span>
        <span class="connector-badge">{$ctxLimitDetected > 0 ? $ctxLimitDetected : "Unknown"}</span>
      </div>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">API URL</span>
        </span>
        <input
          class="text-input"
          type="text"
          bind:value={connectorUrl}
          onblur={commitConnector}
          onkeydown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
        />
      </label>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">API Key</span>
        </span>
        <input
          class="text-input"
          type="text"
          bind:value={connectorApiKey}
          onblur={commitConnector}
          onkeydown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
        />
      </label>

      <div class="divider"></div>

      <!-- Story Defaults -->
      <div class="section-label">Story Defaults</div>

      <label class="row row-input row-stack">
        <span class="row-text">
          <span class="row-title">Default Author Note</span>
          <span class="row-sub">Applied to newly created stories</span>
        </span>
        <textarea class="text-input" rows="3" bind:value={authorNoteDraft} onblur={commitAuthorNote}></textarea>
      </label>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Author Note Depth</span>
          <span class="row-sub">How many recent turns from the bottom to inject</span>
        </span>
        <input
          class="num-input"
          type="number"
          min="0"
          max="100"
          step="1"
          bind:value={authorNoteDepthDraft}
          onblur={commitAuthorNote}
        />
      </label>

      <div class="divider"></div>

      <!-- Preset -->
      <div class="section-label">Sampler Preset</div>
      <div class="preset-row">
        <input
          class="hidden-input"
          type="file"
          accept="application/json,.json"
          bind:this={importFileInput}
          onchange={handleImportPresetJson}
        />

        <button class="preset-btn preset-import" onclick={openImportPreset} title="Import a JSON preset file">
          Import JSON
        </button>
        {#each $presets as preset}
          <div class="preset-item">
            <button
              class="preset-btn"
              class:active={activePreset === preset.name}
              onclick={() => applyPreset(preset.name)}
              title={preset.description}
            >
              {preset.name}
            </button>
            {#if preset.id}
              <button class="preset-btn preset-del" onclick={() => deletePreset(preset)} title="Delete custom preset">
                ×
              </button>
            {/if}
          </div>
        {/each}
        {#if activePreset === "Custom"}
          <span class="preset-btn custom-badge">Custom</span>
        {/if}
      </div>

      <div class="divider"></div>

      <!-- Sampling -->
      <div class="section-label">Sampling</div>
      {#each samplingParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Repetition Penalties -->
      <div class="section-label">Repetition Penalties</div>
      {#each repetitionParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- DRY -->
      <div class="section-label">DRY (Diverse Repetition Penalty)</div>
      {#each dryParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Mirostat -->
      <div class="section-label">Mirostat</div>
      {#each mirostatParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Dynamic Temperature -->
      <div class="section-label">Dynamic Temperature</div>
      {#each dynatempParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- XTC -->
      <div class="section-label">XTC (Token Cutting)</div>
      {#each xtcParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Other -->
      <div class="section-label">Other</div>
      {#each otherParams as p}
        <label class="row row-input">
          <span class="row-text">
            <span class="row-title">{p.label}</span>
            <span class="row-sub">{p.sub}</span>
          </span>
          <input
            class="num-input"
            type="number"
            value={$generation[p.key]}
            min={p.min}
            max={p.max}
            step={p.step}
            onchange={(e) => handleNumInput(p.key, e, p.int)}
          />
        </label>
      {/each}

      <div class="divider"></div>

      <!-- Advanced -->
      <div class="section-label">Advanced</div>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Ban EOS Token</span>
          <span class="row-sub">Prevent the model from ending early</span>
        </span>
        <input
          type="checkbox"
          checked={$generation.ban_eos_token}
          onchange={(e) => setGen("ban_eos_token", (e.target as HTMLInputElement).checked)}
        />
      </label>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Render Special Tokens</span>
          <span class="row-sub">Show special tokens in output (debug)</span>
        </span>
        <input
          type="checkbox"
          checked={$generation.render_special}
          onchange={(e) => setGen("render_special", (e.target as HTMLInputElement).checked)}
        />
      </label>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Sampler Order</span>
          <span class="row-sub">Comma-separated list (Kobold default: 6,0,1,3,4,2,5)</span>
        </span>
        <input
          class="text-input"
          type="text"
          bind:value={samplerOrderDraft}
          onblur={commitSamplerOrder}
          onkeydown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur()
          }}
        />
      </label>

      <div class="divider"></div>

      <div class="section-label">Smooth Sampling</div>
      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Smoothing Factor</span>
          <span class="row-sub">0 = off</span>
        </span>
        <input
          class="num-input"
          type="number"
          value={$generation.smoothing_factor}
          min="0"
          max="1"
          step="0.01"
          onchange={(e) => handleNumInput("smoothing_factor", e)}
        />
      </label>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Smoothing Curve</span>
          <span class="row-sub">Curve shaping for smoothing</span>
        </span>
        <input
          class="num-input"
          type="number"
          value={$generation.smoothing_curve}
          min="0.1"
          max="5"
          step="0.1"
          onchange={(e) => handleNumInput("smoothing_curve", e)}
        />
      </label>

      <div class="divider"></div>

      <div class="section-label">Adaptive Sampling</div>
      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Adaptive Target</span>
          <span class="row-sub">-1 = off</span>
        </span>
        <input
          class="num-input"
          type="number"
          value={$generation.adaptive_target}
          min="-1"
          max="1"
          step="0.01"
          onchange={(e) => handleNumInput("adaptive_target", e)}
        />
      </label>

      <label class="row row-input">
        <span class="row-text">
          <span class="row-title">Adaptive Decay</span>
          <span class="row-sub">0.01–0.99 (higher = slower adaptation)</span>
        </span>
        <input
          class="num-input"
          type="number"
          value={$generation.adaptive_decay}
          min="0.01"
          max="0.99"
          step="0.01"
          onchange={(e) => handleNumInput("adaptive_decay", e)}
        />
      </label>

      <div class="divider"></div>

      <div class="section-label">Bans & Bias</div>

      <label class="row row-input row-stack">
        <span class="row-text">
          <span class="row-title">Banned Tokens</span>
          <span class="row-sub">One per line</span>
        </span>
        <textarea class="text-input" rows="4" bind:value={bannedTokensDraft} onblur={commitBannedTokens}></textarea>
      </label>

      <label class="row row-input row-stack">
        <span class="row-text">
          <span class="row-title">Logit Bias</span>
          <span class="row-sub">JSON object: &#123;"token_id": -100, ...&#125;</span>
        </span>
        <textarea class="text-input" rows="4" bind:value={logitBiasDraft} onblur={commitLogitBias}></textarea>
      </label>

      <label class="row row-input row-stack">
        <span class="row-text">
          <span class="row-title">DRY Sequence Breakers</span>
          <span class="row-sub">JSON array of strings (used when DRY Multiplier &gt; 0)</span>
        </span>
        <textarea class="text-input" rows="4" bind:value={dryBreakersDraft} onblur={commitDryBreakers}></textarea>
      </label>

      <div class="bottom-pad"></div>
    {:else if activeTab === "prompts"}
      <div class="section-label">Prompt Templates</div>

      <div class="prompt-hint">
        Advanced: edit JSON stored in SQLite. Changes affect future generations immediately.
      </div>

      <div class="prompt-rail" aria-label="Prompt file picker">
        {#if promptFiles.length === 0}
          <div class="prompt-rail-empty">{promptLoading ? "Loading…" : "No prompt templates found."}</div>
        {:else}
          {#each promptFiles as p (p.name)}
            <button
              type="button"
              class="prompt-pill"
              class:active={p.name === promptSelected}
              disabled={promptLoading || promptSaving}
              aria-pressed={p.name === promptSelected}
              onclick={() => selectPromptFile(p.name)}
            >
              <span class="prompt-pill-label">{PROMPT_LABELS[p.name] ?? p.name}</span>
              {#if p.name === promptSelected && promptDirty}
                <span class="prompt-pill-dirty" title="Unsaved changes" aria-label="Unsaved changes">●</span>
              {/if}
            </button>
          {/each}
        {/if}
      </div>

      <label class="row row-input row-stack">
        <span class="row-text">
          <span class="row-title">Config (JSON)</span>
          <span class="row-sub">
            {promptLoading
              ? "Loading…"
              : promptSelectedRow?.updated_at
                ? `Updated: ${promptSelectedRow.updated_at}`
                : "Not loaded"}
          </span>
        </span>
        <textarea
          class="text-input prompt-editor"
          rows="18"
          bind:value={promptDraft}
          spellcheck="false"
          disabled={promptLoading || promptSaving}
          oninput={() => (promptDirty = true)}
        ></textarea>
      </label>

      {#if promptError}
        <div class="prompt-error">{promptError}</div>
      {/if}

      <div class="prompt-actions">
        <button
          type="button"
          class="btn-primary small"
          disabled={!promptDirty || promptSaving || promptLoading}
          onclick={savePromptFile}
        >
          {promptSaving ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          class="btn-ghost small"
          disabled={promptSaving || promptLoading}
          onclick={formatPromptDraft}
        >
          Format
        </button>
        <button
          type="button"
          class="btn-ghost small"
          disabled={promptSaving || promptLoading}
          onclick={resetPromptFile}
        >
          Reset
        </button>
        <button
          type="button"
          class="btn-ghost small prompt-danger"
          disabled={promptSaving || promptLoading}
          onclick={resetAllPromptFiles}
        >
          Reset All
        </button>
      </div>

      <div class="bottom-pad"></div>
    {:else if activeTab === "modules"}
      <div class="section-label">Defaults</div>
      <div class="modules-settings">
        <StoryModulesPanel modules={$storyDefaults} setModules={setStoryDefaults} />
      </div>
      <div class="bottom-pad"></div>
    {/if}
  </div>
</div>

<style>
  .settings {
    background: var(--bg);
  }

  /* ── Tabs ──────────────────────────────────────────── */
  .tabs {
    display: flex;
    border-bottom: 1px solid var(--border);
    flex-shrink: 0;
  }
  .tab {
    flex: 1;
    background: none;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 500;
    padding: 0.7rem 0.5rem;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s;
    letter-spacing: 0.02em;
  }
  .tab:hover {
    color: var(--text);
  }
  .tab.active {
    color: var(--accent);
    border-bottom-color: var(--accent);
  }

  /* ── List ──────────────────────────────────────────── */
  .list {
    flex: 1;
    overflow-y: auto;
  }

  .section-label {
    padding: 1.25rem 1rem 0.4rem;
    font-size: 0.7rem;
    letter-spacing: 0.1em;
    color: var(--accent);
  }

  .row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.9rem 1rem;
    border-bottom: 1px solid var(--border);
    cursor: pointer;
    transition: background 0.12s;
    gap: 1rem;
  }
  .row:hover {
    background: var(--bg-action);
  }

  .row-text {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    flex: 1;
    min-width: 0;
  }
  .row-title {
    font-family: var(--font-ui);
    font-size: 0.95rem;
    font-weight: 400;
    color: var(--text);
  }
  .row-sub {
    font-family: var(--font-ui);
    font-size: 0.78rem;
    color: var(--text-dim);
    line-height: 1.4;
  }

  /* ── Input fields ─────────────────────────────────── */
  .row-input {
    cursor: default;
  }
  .row-stack {
    flex-direction: column;
    align-items: stretch;
    gap: 0.6rem;
  }
  .row-stack .text-input {
    width: 100%;
  }

  .modules-settings {
    padding: 0.4rem 1rem 1rem;
  }

  /* ── Prompt settings ─────────────────────────────── */
  .prompt-hint {
    padding: 0.45rem 1rem 0.15rem;
    color: var(--text-dim);
    font-size: 0.8rem;
    line-height: 1.4;
  }
  .prompt-rail {
    display: flex;
    gap: 0.5rem;
    padding: 0.5rem 1rem 0.4rem;
    overflow-x: auto;
    -webkit-overflow-scrolling: touch;
  }
  .prompt-rail-empty {
    padding: 0.15rem 0;
    color: var(--text-dim);
    font-size: 0.8rem;
    line-height: 1.3;
  }
  .prompt-pill {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    padding: 0.38rem 0.65rem;
    border-radius: var(--radius-pill);
    border: 1px solid var(--border);
    background: var(--bg-input);
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    cursor: pointer;
    white-space: nowrap;
    transition:
      border-color 0.15s var(--ease-out),
      color 0.15s var(--ease-out),
      background 0.15s var(--ease-out);
  }
  .prompt-pill:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-hover);
    background: rgba(255, 255, 255, 0.02);
  }
  .prompt-pill:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .prompt-pill.active {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .prompt-pill-dirty {
    color: var(--danger);
    font-size: 0.7rem;
    line-height: 1;
    transform: translateY(-0.5px);
  }
  .prompt-editor {
    width: 100%;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace;
  }
  .prompt-actions {
    display: flex;
    gap: 0.6rem;
    padding: 0.6rem 1rem 0.2rem;
    flex-wrap: wrap;
  }
  .prompt-danger {
    color: var(--danger);
    border-color: rgba(181, 64, 64, 0.5);
  }
  .prompt-danger:hover:not(:disabled) {
    color: var(--danger);
    border-color: var(--danger);
    background: rgba(181, 64, 64, 0.08);
  }
  .prompt-error {
    padding: 0.2rem 1rem 0.6rem;
    color: var(--danger);
    font-size: 0.85rem;
    line-height: 1.35;
  }

  .connector-badge {
    font-family: var(--font-ui);
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--accent);
    background: var(--accent-dim);
    padding: 0.25rem 0.6rem;
    letter-spacing: 0.03em;
  }

  /* ── Presets ──────────────────────────────────────── */
  .hidden-input {
    display: none;
  }
  .preset-row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    padding: 0.6rem 1rem 0.8rem;
  }
  .preset-item {
    display: flex;
    gap: 0.35rem;
    align-items: center;
  }
  .preset-btn {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-family: var(--font-ui);
    font-size: 0.8rem;
    font-weight: 500;
    padding: 0.4rem 0.85rem;
    cursor: pointer;
    transition:
      color 0.15s,
      border-color 0.15s,
      background 0.15s;
  }
  .preset-btn:hover {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .preset-btn.active {
    color: var(--accent);
    border-color: var(--accent);
    background: var(--accent-dim);
  }
  .preset-btn.preset-import {
    color: var(--accent);
    border-color: var(--accent-dim);
  }
  .preset-btn.preset-del {
    padding: 0.4rem 0.55rem;
    color: var(--danger);
    border-color: rgba(181, 64, 64, 0.5);
  }
  .preset-btn.preset-del:hover {
    border-color: var(--danger);
    color: var(--danger);
  }
  .custom-badge {
    cursor: default;
    font-style: italic;
    opacity: 0.7;
  }

  .bottom-pad {
    height: 2rem;
  }
</style>
