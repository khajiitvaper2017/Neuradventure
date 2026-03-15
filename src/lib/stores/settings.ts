import { writable } from "svelte/store"
import { settings as settingsService } from "@/services/settings"
import type {
  AppSettings,
  GenerationParams,
  KoboldCppConnector,
  LLMConnector,
  SectionFormat,
  TimeoutSettings,
} from "@/shared/api-types"
import type { StoryModules } from "@/shared/types"

export type Theme = "default" | "amoled"
export type Design = "classic" | "roboto"

const DEFAULT_KOBOLD_CONNECTOR: KoboldCppConnector = {
  type: "koboldcpp",
  url: "http://localhost:5001/v1",
  api_keys: {
    koboldcpp: "kobold",
    openrouter: "",
  },
}

const DEFAULT_CONNECTOR: LLMConnector = { ...DEFAULT_KOBOLD_CONNECTOR }

const DEFAULT_GENERATION: GenerationParams = {
  max_tokens: 1500,
  ctx_limit: 0,
  temperature: 0.85,
  top_k: 40,
  top_a: 0.0,
  top_p: 0.95,
  min_p: 0.05,
  typical_p: 1.0,
  tfs: 1.0,
  top_n_sigma: -1.0,
  repeat_penalty: 1.0,
  repeat_last_n: 320,
  rep_pen_slope: 1.0,
  presence_penalty: 0.0,
  frequency_penalty: 0.0,
  mirostat: 0,
  mirostat_tau: 5.0,
  mirostat_eta: 0.1,
  dynatemp_range: 0.0,
  dynatemp_exponent: 1.0,
  smoothing_factor: 0.0,
  smoothing_curve: 1.0,
  adaptive_target: -1.0,
  adaptive_decay: 0.9,
  dry_multiplier: 0.0,
  dry_base: 1.75,
  dry_allowed_length: 2,
  dry_penalty_last_n: -1,
  dry_sequence_breakers: ["\n", ":", '"', "*"],
  xtc_probability: 0.0,
  xtc_threshold: 0.1,
  ban_eos_token: false,
  sampler_order: [6, 0, 1, 3, 4, 2, 5],
  banned_tokens: [],
  logit_bias: {},
  render_special: false,
  seed: -1,
}

const DEFAULT_STORY_MODULES: StoryModules = {
  track_npcs: true,
  track_locations: true,
  track_background_events: false,
  character_appearance_clothing: true,
  character_personality_traits: true,
  character_major_flaws: true,
  character_quirks: true,
  character_perks: true,
  character_inventory: true,
  npc_appearance_clothing: true,
  npc_personality_traits: true,
  npc_major_flaws: true,
  npc_quirks: true,
  npc_perks: true,
  npc_location: true,
  npc_activity: true,
}

export const DEFAULT_TIMEOUTS: TimeoutSettings = {
  llmRequestMs: 10 * 60 * 1000,
  upstreamFetchMs: 15 * 1000,
  streamSessionTtlMs: 45 * 1000,
  modelsCacheTtlMs: 5 * 60 * 1000,
  supportedParamsCacheTtlMs: 5 * 60 * 1000,
  ctxLimitCacheTtlMs: 5 * 60 * 1000,
  pendingRequestTtlMs: 10 * 60 * 1000,
  uiErrorToastMs: 4000,
  uiQuietNoticeMs: 3500,
  uiFlashMs: 900,
  uiKeyboardScrollDelayMs: 120,
  uiResumePendingTurnDelayMs: 500,
  fieldWatchDebounceMs: 50,
}

const themeStore = writable<Theme>("amoled")
const designStore = writable<Design>("classic")
const textJustifyStore = writable<boolean>(true)
const colorSchemeStore = writable<"gold" | "emerald" | "sapphire" | "crimson">("crimson")
const streamingEnabledStore = writable<boolean>(false)
const sectionFormatStore = writable<SectionFormat>("markdown")
const timeoutsStore = writable<TimeoutSettings>({ ...DEFAULT_TIMEOUTS })
const authorNoteEnabledStore = writable<boolean>(true)
const connectorStore = writable<LLMConnector>({ ...DEFAULT_CONNECTOR })
const generationStore = writable<GenerationParams>({ ...DEFAULT_GENERATION })
const ctxLimitDetectedStore = writable<number>(0)
const defaultAuthorNoteStore = writable<string>(
  "Remember the instructions you were given at the beginning of this chat.",
)
const defaultAuthorNoteDepthStore = writable<number>(4)
const defaultAuthorNotePositionStore = writable<number>(1)
const defaultAuthorNoteIntervalStore = writable<number>(1)
const defaultAuthorNoteRoleStore = writable<number>(0)
const defaultAuthorNoteEmbedStateStore = writable<boolean>(false)
const storyDefaultsStore = writable<StoryModules>({ ...DEFAULT_STORY_MODULES })

let initialized = false
let suppressSync = true
let current: AppSettings = {
  theme: "amoled",
  design: "classic",
  textJustify: true,
  colorScheme: "crimson",
  streamingEnabled: false,
  sectionFormat: "markdown",
  timeouts: { ...DEFAULT_TIMEOUTS },
  authorNoteEnabled: true,
  defaultAuthorNote: "Remember the instructions you were given at the beginning of this chat.",
  defaultAuthorNoteDepth: 4,
  defaultAuthorNotePosition: 1,
  defaultAuthorNoteInterval: 1,
  defaultAuthorNoteRole: 0,
  defaultAuthorNoteEmbedState: false,
  storyDefaults: { ...DEFAULT_STORY_MODULES },
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
  streamingEnabledStore.set(settings.streamingEnabled ?? false)
  sectionFormatStore.set(settings.sectionFormat ?? "markdown")
  timeoutsStore.set(settings.timeouts ?? DEFAULT_TIMEOUTS)
  authorNoteEnabledStore.set(settings.authorNoteEnabled ?? true)
  defaultAuthorNoteStore.set(settings.defaultAuthorNote)
  defaultAuthorNoteDepthStore.set(settings.defaultAuthorNoteDepth)
  defaultAuthorNotePositionStore.set(settings.defaultAuthorNotePosition ?? 1)
  defaultAuthorNoteIntervalStore.set(settings.defaultAuthorNoteInterval ?? 1)
  defaultAuthorNoteRoleStore.set(settings.defaultAuthorNoteRole ?? 0)
  defaultAuthorNoteEmbedStateStore.set(settings.defaultAuthorNoteEmbedState ?? false)
  storyDefaultsStore.set(settings.storyDefaults)
  connectorStore.set(settings.connector)
  generationStore.set(settings.generation)
  ctxLimitDetectedStore.set(settings.ctx_limit_detected ?? 0)
  suppressSync = false
  initialized = true
}

async function persistSettings(partial: Partial<AppSettings>) {
  if (!initialized || suppressSync) return
  try {
    await settingsService.update(partial)
  } catch (err) {
    console.error("[settings] Failed to save settings", err)
  }
}

export async function initSettings() {
  try {
    const settings = await settingsService.get()
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

streamingEnabledStore.subscribe((value) => {
  current = { ...current, streamingEnabled: value }
  if (!suppressSync) void persistSettings({ streamingEnabled: value })
})

sectionFormatStore.subscribe((value) => {
  current = { ...current, sectionFormat: value }
  if (!suppressSync) void persistSettings({ sectionFormat: value })
})

timeoutsStore.subscribe((value) => {
  current = { ...current, timeouts: value }
  if (!suppressSync) void persistSettings({ timeouts: value })
})

authorNoteEnabledStore.subscribe((value) => {
  current = { ...current, authorNoteEnabled: value }
  if (!suppressSync) void persistSettings({ authorNoteEnabled: value })
})

defaultAuthorNoteStore.subscribe((value) => {
  current = { ...current, defaultAuthorNote: value }
  if (!suppressSync) void persistSettings({ defaultAuthorNote: value })
})

defaultAuthorNoteDepthStore.subscribe((value) => {
  current = { ...current, defaultAuthorNoteDepth: value }
  if (!suppressSync) void persistSettings({ defaultAuthorNoteDepth: value })
})

defaultAuthorNotePositionStore.subscribe((value) => {
  current = { ...current, defaultAuthorNotePosition: value }
  if (!suppressSync) void persistSettings({ defaultAuthorNotePosition: value })
})

defaultAuthorNoteIntervalStore.subscribe((value) => {
  current = { ...current, defaultAuthorNoteInterval: value }
  if (!suppressSync) void persistSettings({ defaultAuthorNoteInterval: value })
})

defaultAuthorNoteRoleStore.subscribe((value) => {
  current = { ...current, defaultAuthorNoteRole: value }
  if (!suppressSync) void persistSettings({ defaultAuthorNoteRole: value })
})

defaultAuthorNoteEmbedStateStore.subscribe((value) => {
  current = { ...current, defaultAuthorNoteEmbedState: value }
  if (!suppressSync) void persistSettings({ defaultAuthorNoteEmbedState: value })
})

storyDefaultsStore.subscribe((value) => {
  current = { ...current, storyDefaults: value }
  if (!suppressSync) void persistSettings({ storyDefaults: value })
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
export const streamingEnabled = streamingEnabledStore
export const sectionFormat = sectionFormatStore
export const timeouts = timeoutsStore
export const authorNoteEnabled = authorNoteEnabledStore
export const defaultAuthorNote = defaultAuthorNoteStore
export const defaultAuthorNoteDepth = defaultAuthorNoteDepthStore
export const defaultAuthorNotePosition = defaultAuthorNotePositionStore
export const defaultAuthorNoteInterval = defaultAuthorNoteIntervalStore
export const defaultAuthorNoteRole = defaultAuthorNoteRoleStore
export const defaultAuthorNoteEmbedState = defaultAuthorNoteEmbedStateStore
export const storyDefaults = storyDefaultsStore
export const connector = connectorStore
export const generation = generationStore
export const ctxLimitDetected = ctxLimitDetectedStore
