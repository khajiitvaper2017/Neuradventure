import { writable, readable, get } from "svelte/store"
import { goto } from "$app/navigation"
import { timeouts } from "@/stores/settings"

export type Screen = "home" | "char-create" | "new-story" | "new-chat" | "game" | "chat" | "settings"

export const activeScreen = writable<Screen>("home")
export const routeStoryId = writable<number | null>(null)
export const routeChatId = writable<number | null>(null)

export function syncRouteFromUrl(url: URL) {
  closeCharSheet()

  const path = url.pathname.replace(/\/+$/, "") || "/"
  const screen: Screen =
    path === "/"
      ? "home"
      : path === "/game"
        ? "game"
        : path === "/chat"
          ? "chat"
          : path === "/stories/new"
            ? "new-story"
            : path === "/chats/new"
              ? "new-chat"
              : path === "/characters/new"
                ? "char-create"
                : path === "/settings"
                  ? "settings"
                  : "home"

  activeScreen.set(screen)

  const storyId = screen === "game" ? Number(url.searchParams.get("story") ?? "") : Number.NaN
  const chatId = screen === "chat" ? Number(url.searchParams.get("chat") ?? "") : Number.NaN

  routeStoryId.set(screen === "game" && Number.isFinite(storyId) && storyId > 0 ? storyId : null)
  routeChatId.set(screen === "chat" && Number.isFinite(chatId) && chatId > 0 ? chatId : null)
}

export function navigate(
  screen: Screen,
  options: { replace?: boolean; reset?: boolean; params?: { storyId?: number; chatId?: number } } = {},
) {
  closeCharSheet()

  const nextStoryId = screen === "game" ? (options.params?.storyId ?? get(routeStoryId)) : null
  const nextChatId = screen === "chat" ? (options.params?.chatId ?? get(routeChatId)) : null
  const nextScreen = (screen === "game" && !nextStoryId) || (screen === "chat" && !nextChatId) ? "home" : screen

  let href = "/"
  if (nextScreen === "home") href = "/"
  else if (nextScreen === "settings") href = "/settings"
  else if (nextScreen === "char-create") href = "/characters/new"
  else if (nextScreen === "new-story") href = "/stories/new"
  else if (nextScreen === "new-chat") href = "/chats/new"
  else if (nextScreen === "game") href = `/game?story=${encodeURIComponent(String(nextStoryId))}`
  else if (nextScreen === "chat") href = `/chat?chat=${encodeURIComponent(String(nextChatId))}`

  void goto(href, { replaceState: !!options.replace, keepFocus: true, noScroll: false })
}

export function goBack(fallback: Screen = "home") {
  if (typeof history !== "undefined" && history.length > 1) {
    history.back()
    return
  }
  navigate(fallback, { replace: true })
}
export const showCharSheet = writable(false)
export const charSheetCharacterId = writable<number | null>(null)
export const showNPCTracker = writable(false)
export const showLocations = writable(false)
export const errorMessage = writable<string | null>(null)
export const quietNotice = writable<string | null>(null)

export function openCharSheetForCharacter(id: number) {
  if (!Number.isFinite(id) || id <= 0) return
  charSheetCharacterId.set(id)
  showCharSheet.set(true)
}

export function closeCharSheet() {
  showCharSheet.set(false)
  charSheetCharacterId.set(null)
}

export function showError(msg: string, durationMs?: number) {
  errorMessage.set(msg)
  const ms = durationMs ?? get(timeouts).uiErrorToastMs
  setTimeout(() => errorMessage.set(null), ms)
}

export function showQuietNotice(msg: string, durationMs?: number) {
  quietNotice.set(msg)
  const ms = durationMs ?? get(timeouts).uiQuietNoticeMs
  setTimeout(() => quietNotice.set(null), ms)
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
export const collapseNPCTracker = writable(false)
export const collapseLocationsPanel = writable(false)

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
