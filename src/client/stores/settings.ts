import { writable } from "svelte/store"
import { api, type AppSettings, type LLMConnector, type GenerationParams } from "../api/client.js"

export type Theme = "default" | "amoled"
export type Design = "classic" | "roboto"

const DEFAULT_CONNECTOR: LLMConnector = {
  type: "koboldcpp",
  url: "http://localhost:5001/v1",
  api_key: "kobold",
}

const DEFAULT_GENERATION: GenerationParams = {
  max_tokens: 1500,
  temperature: 0.85,
  top_k: 40,
  top_p: 0.95,
  min_p: 0.05,
  typical_p: 1.0,
  top_n_sigma: -1.0,
  repeat_penalty: 1.0,
  repeat_last_n: 64,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
  mirostat: 0,
  mirostat_tau: 5.0,
  mirostat_eta: 0.1,
  dynatemp_range: 0.0,
  dynatemp_exponent: 1.0,
  dry_multiplier: 0.0,
  dry_base: 1.75,
  dry_allowed_length: 2,
  dry_penalty_last_n: -1,
  xtc_probability: 0.0,
  xtc_threshold: 0.1,
  seed: -1,
}

const themeStore = writable<Theme>("default")
const designStore = writable<Design>("classic")
const textJustifyStore = writable<boolean>(true)
const colorSchemeStore = writable<"gold" | "emerald" | "sapphire" | "crimson">("gold")
const connectorStore = writable<LLMConnector>({ ...DEFAULT_CONNECTOR })
const generationStore = writable<GenerationParams>({ ...DEFAULT_GENERATION })

let initialized = false
let suppressSync = true
let current: AppSettings = {
  theme: "default",
  design: "classic",
  textJustify: true,
  colorScheme: "gold",
  connector: { ...DEFAULT_CONNECTOR },
  generation: { ...DEFAULT_GENERATION },
}

function applySettings(settings: AppSettings) {
  suppressSync = true
  current = settings
  themeStore.set(settings.theme)
  designStore.set(settings.design)
  textJustifyStore.set(settings.textJustify)
  colorSchemeStore.set(settings.colorScheme)
  connectorStore.set(settings.connector)
  generationStore.set(settings.generation)
  suppressSync = false
  initialized = true
}

async function persistSettings(partial: Partial<AppSettings>) {
  if (!initialized || suppressSync) return
  try {
    await api.settings.update(partial)
  } catch (err) {
    console.error("[settings] Failed to save settings", err)
  }
}

export async function initSettings() {
  try {
    const settings = await api.settings.get()
    applySettings(settings)
  } catch (err) {
    console.error("[settings] Failed to load settings, using defaults", err)
    initialized = true
    suppressSync = false
  }
}

themeStore.subscribe((value) => {
  current = { ...current, theme: value }
  if (!suppressSync) void persistSettings({ theme: value })
})

designStore.subscribe((value) => {
  current = { ...current, design: value }
  if (!suppressSync) void persistSettings({ design: value })
})

textJustifyStore.subscribe((value) => {
  current = { ...current, textJustify: value }
  if (!suppressSync) void persistSettings({ textJustify: value })
})

colorSchemeStore.subscribe((value) => {
  current = { ...current, colorScheme: value }
  if (!suppressSync) void persistSettings({ colorScheme: value })
})

connectorStore.subscribe((value) => {
  current = { ...current, connector: value }
  if (!suppressSync) void persistSettings({ connector: value })
})

generationStore.subscribe((value) => {
  current = { ...current, generation: value }
  if (!suppressSync) void persistSettings({ generation: value })
})

export const theme = themeStore
export const design = designStore
export const textJustify = textJustifyStore
export const colorScheme = colorSchemeStore
export const connector = connectorStore
export const generation = generationStore
