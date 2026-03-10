import { writable } from "svelte/store"
import { api, type AppSettings } from "../api/client.js"

export type Theme = "default" | "amoled"
export type Design = "classic" | "roboto"

const themeStore = writable<Theme>("default")
const designStore = writable<Design>("classic")

let initialized = false
let suppressSync = true
let current: AppSettings = { theme: "default", design: "classic" }

function applySettings(settings: AppSettings) {
  suppressSync = true
  current = settings
  themeStore.set(settings.theme)
  designStore.set(settings.design)
  suppressSync = false
  initialized = true
}

async function persistSettings() {
  if (!initialized || suppressSync) return
  try {
    await api.settings.update({ theme: current.theme, design: current.design })
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
  if (!suppressSync) void persistSettings()
})

designStore.subscribe((value) => {
  current = { ...current, design: value }
  if (!suppressSync) void persistSettings()
})

export const theme = themeStore
export const design = designStore
