import { writable } from "svelte/store"
import { DEFAULT_SETTINGS } from "@/engine/db"
import { settings as settingsService } from "@/services/settings"
import type { AppSettings, LLMConnector, SectionFormat, TimeoutSettings } from "@/shared/api-types"
import type { StoryModules } from "@/shared/types"

export type ColorMode = "light" | "dark" | "system"

export const DEFAULT_TIMEOUTS: TimeoutSettings = {
  ...DEFAULT_SETTINGS.timeouts,
}

function cloneConnector(connector: LLMConnector): LLMConnector {
  return {
    ...connector,
    api_keys: { ...connector.api_keys },
    ...(connector.type === "openrouter" ? { model: connector.model } : {}),
  } as LLMConnector
}

function cloneStoryModules(modules: StoryModules): StoryModules {
  return { ...modules }
}

function cloneGeneration(params: AppSettings["generation"]): AppSettings["generation"] {
  return {
    ...params,
    dry_sequence_breakers: params.dry_sequence_breakers.slice(),
    sampler_order: params.sampler_order.slice(),
    banned_tokens: params.banned_tokens.slice(),
    logit_bias: { ...params.logit_bias },
  }
}

const colorModeStore = writable<ColorMode>("system")
const streamingEnabledStore = writable<boolean>(false)
const sectionFormatStore = writable<SectionFormat>("markdown")
const timeoutsStore = writable<TimeoutSettings>({ ...DEFAULT_TIMEOUTS })
const authorNoteEnabledStore = writable<boolean>(true)
const connectorStore = writable<LLMConnector>(cloneConnector(DEFAULT_SETTINGS.connector))
const generationStore = writable<AppSettings["generation"]>(cloneGeneration(DEFAULT_SETTINGS.generation))
const ctxLimitDetectedStore = writable<number>(0)
const defaultAuthorNoteStore = writable<string>(
  "Remember the instructions you were given at the beginning of this chat.",
)
const defaultAuthorNoteDepthStore = writable<number>(4)
const defaultAuthorNotePositionStore = writable<number>(1)
const defaultAuthorNoteIntervalStore = writable<number>(1)
const defaultAuthorNoteRoleStore = writable<number>(0)
const defaultAuthorNoteEmbedStateStore = writable<boolean>(false)
const storyDefaultsStore = writable<StoryModules>(cloneStoryModules(DEFAULT_SETTINGS.storyDefaults))

let initialized = false
let suppressSync = true
let current: AppSettings = {
  ...DEFAULT_SETTINGS,
  timeouts: { ...DEFAULT_TIMEOUTS },
  storyDefaults: cloneStoryModules(DEFAULT_SETTINGS.storyDefaults),
  connector: cloneConnector(DEFAULT_SETTINGS.connector),
  generation: cloneGeneration(DEFAULT_SETTINGS.generation),
}

function applySettings(settings: AppSettings) {
  suppressSync = true
  current = settings
  colorModeStore.set(settings.colorMode)
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

colorModeStore.subscribe((value) => {
  current = { ...current, colorMode: value }
  if (!suppressSync) void persistSettings({ colorMode: value })
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

export const colorMode = colorModeStore
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
