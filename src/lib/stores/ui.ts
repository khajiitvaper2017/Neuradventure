import { writable, readable, get } from "svelte/store"
import { INTERNAL_UI_ERROR_TOAST_MS, INTERNAL_UI_QUIET_NOTICE_MS } from "@/shared/internal-timeouts"
export const errorMessage = writable<string | null>(null)
export const quietNotice = writable<string | null>(null)

let errorTimer: ReturnType<typeof setTimeout> | null = null
let quietTimer: ReturnType<typeof setTimeout> | null = null

export function showError(msg: string, durationMs?: number) {
  errorMessage.set(msg)
  if (errorTimer !== null) clearTimeout(errorTimer)
  const ms = durationMs ?? INTERNAL_UI_ERROR_TOAST_MS
  errorTimer = setTimeout(() => {
    errorTimer = null
    errorMessage.set(null)
  }, ms)
}

export function showQuietNotice(msg: string, durationMs?: number) {
  quietNotice.set(msg)
  if (quietTimer !== null) clearTimeout(quietTimer)
  const ms = durationMs ?? INTERNAL_UI_QUIET_NOTICE_MS
  quietTimer = setTimeout(() => {
    quietTimer = null
    quietNotice.set(null)
  }, ms)
}

// ─── Confirm dialog ──────────────────────────────────────────────────────────

export interface ConfirmOptions {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
}

type ConfirmResolve = (confirmed: boolean) => void

export const confirmDialog = writable<(ConfirmOptions & { resolve: ConfirmResolve }) | null>(null)
export const collapseCharSheet = writable(false)

export function showConfirm(options: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    confirmDialog.set({ ...options, resolve })
  })
}

export function resolveConfirm(confirmed: boolean) {
  const current = get(confirmDialog)
  if (current) {
    current.resolve(confirmed)
    confirmDialog.set(null)
  }
}

const DESKTOP_MQ = "(min-width: 1400px)"

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
