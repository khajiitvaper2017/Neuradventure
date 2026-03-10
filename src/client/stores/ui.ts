import { writable, readable } from "svelte/store"

export type Screen = "home" | "char-create" | "new-story" | "game" | "settings"

export const activeScreen = writable<Screen>("home")
export const showCharSheet = writable(false)
export const showNPCTracker = writable(false)
export const errorMessage = writable<string | null>(null)

export function showError(msg: string, durationMs = 4000) {
  errorMessage.set(msg)
  setTimeout(() => errorMessage.set(null), durationMs)
}

const DESKTOP_MQ = "(min-width: 1200px)"

export const isDesktop = readable(
  typeof window !== "undefined" ? window.matchMedia(DESKTOP_MQ).matches : false,
  (set) => {
    if (typeof window === "undefined") return
    const mq = window.matchMedia(DESKTOP_MQ)
    const onChange = (e: MediaQueryListEvent) => set(e.matches)
    mq.addEventListener("change", onChange)
    set(mq.matches)
    return () => mq.removeEventListener("change", onChange)
  },
)
