import { writable } from "svelte/store"
import { api, type SamplerPreset } from "../api/client.js"

export type { SamplerPreset }

const presetsStore = writable<SamplerPreset[]>([])
let loaded = false

export async function loadPresets() {
  if (loaded) return
  try {
    const list = await api.settings.presets()
    presetsStore.set(list)
    loaded = true
  } catch (err) {
    console.error("[presets] Failed to load presets.", err)
  }
}

export const presets = presetsStore
