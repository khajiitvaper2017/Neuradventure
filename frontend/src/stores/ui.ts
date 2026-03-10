import { writable } from "svelte/store"

export type Screen = "home" | "char-create" | "new-story" | "game" | "settings"

export const activeScreen = writable<Screen>("home")
export const showCharSheet = writable(false)
export const showNPCTracker = writable(false)
export const errorMessage = writable<string | null>(null)

export function showError(msg: string, durationMs = 4000) {
  errorMessage.set(msg)
  setTimeout(() => errorMessage.set(null), durationMs)
}
