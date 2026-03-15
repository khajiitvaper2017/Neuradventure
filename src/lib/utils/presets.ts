import { writable } from "svelte/store"
import { settings } from "@/services/settings"
import type { SamplerPreset } from "@/shared/api-types"

export type { SamplerPreset }

const presetsStore = writable<SamplerPreset[]>([])
let loaded = false

export async function loadPresets() {
  if (loaded) return
  await refreshPresets()
}

export const presets = presetsStore

export async function refreshPresets() {
  try {
    const list = await settings.presets()
    presetsStore.set(list)
    loaded = true
  } catch (err) {
    console.error("[presets] Failed to load presets.", err)
  }
}
