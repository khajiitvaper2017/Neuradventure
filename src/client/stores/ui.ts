import { writable, readable, get } from "svelte/store"

export type Screen = "home" | "char-create" | "new-story" | "new-chat" | "game" | "chat" | "settings"

type Route = { screen: Screen; storyId: number | null; chatId: number | null }

function parseHash(hash: string): Route {
  const cleaned = hash.replace(/^#\/?/, "").trim()
  if (!cleaned) return { screen: "home", storyId: null, chatId: null }
  const [segment, rawId] = cleaned.split("/")
  if (segment === "game") {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0) return { screen: "home", storyId: null, chatId: null }
    return { screen: "game", storyId: id, chatId: null }
  }
  if (segment === "chat") {
    const id = Number(rawId)
    if (!Number.isFinite(id) || id <= 0) return { screen: "home", storyId: null, chatId: null }
    return { screen: "chat", storyId: null, chatId: id }
  }
  if (segment === "char-create") return { screen: "char-create", storyId: null, chatId: null }
  if (segment === "new-story") return { screen: "new-story", storyId: null, chatId: null }
  if (segment === "new-chat") return { screen: "new-chat", storyId: null, chatId: null }
  if (segment === "settings") return { screen: "settings", storyId: null, chatId: null }
  return { screen: "home", storyId: null, chatId: null }
}

function buildHash(screen: Screen, storyId: number | null, chatId: number | null): string {
  if (screen === "game") {
    return storyId ? `#/game/${storyId}` : "#/game"
  }
  if (screen === "chat") {
    return chatId ? `#/chat/${chatId}` : "#/chat"
  }
  if (screen === "home") return "#/home"
  return `#/${screen}`
}

const initialRoute: Route =
  typeof window !== "undefined" ? parseHash(window.location.hash) : { screen: "home", storyId: null, chatId: null }

export const activeScreen = writable<Screen>(initialRoute.screen)
export const routeStoryId = writable<number | null>(initialRoute.storyId)
export const routeChatId = writable<number | null>(initialRoute.chatId)
const screenHistory: Screen[] = []
let ignoreNextHashChange = false

function syncFromLocation(resetHistory: boolean) {
  if (typeof window === "undefined") return
  const route = parseHash(window.location.hash)
  activeScreen.set(route.screen)
  routeStoryId.set(route.storyId)
  routeChatId.set(route.chatId)
  if (resetHistory) screenHistory.length = 0
}

export function initRouter() {
  if (typeof window === "undefined") return
  if (!window.location.hash) {
    setHash("home", null, true)
  }
  syncFromLocation(true)
  window.addEventListener("hashchange", () => {
    if (ignoreNextHashChange) {
      ignoreNextHashChange = false
      return
    }
    syncFromLocation(true)
  })
}

function setHash(screen: Screen, storyId: number | null, replace?: boolean) {
  if (typeof window === "undefined") return
  const chatId = screen === "chat" ? get(routeChatId) : null
  const hash = buildHash(screen, storyId, chatId)
  if (window.location.hash === hash) return
  if (replace) {
    window.history.replaceState(null, "", hash)
  } else {
    ignoreNextHashChange = true
    window.location.hash = hash
  }
}

export function navigate(
  screen: Screen,
  options: { replace?: boolean; reset?: boolean; params?: { storyId?: number; chatId?: number } } = {},
) {
  const current = get(activeScreen)
  const nextStoryId = screen === "game" ? (options.params?.storyId ?? get(routeStoryId)) : null
  const nextChatId = screen === "chat" ? (options.params?.chatId ?? get(routeChatId)) : null
  const nextScreen = (screen === "game" && !nextStoryId) || (screen === "chat" && !nextChatId) ? "home" : screen
  activeScreen.set(nextScreen)
  routeStoryId.set(nextScreen === "game" ? nextStoryId : null)
  routeChatId.set(nextScreen === "chat" ? nextChatId : null)
  if (options.reset) screenHistory.length = 0
  if (!options.replace && current !== nextScreen) screenHistory.push(current)
  setHash(nextScreen, nextScreen === "game" ? nextStoryId : null, options.replace)
}

export function goBack(fallback: Screen = "home") {
  const previous = screenHistory.pop() ?? fallback
  navigate(previous, { replace: true })
}
export const showCharSheet = writable(false)
export const showNPCTracker = writable(false)
export const showLocations = writable(false)
export const errorMessage = writable<string | null>(null)
export const quietNotice = writable<string | null>(null)

export function showError(msg: string, durationMs = 4000) {
  errorMessage.set(msg)
  setTimeout(() => errorMessage.set(null), durationMs)
}

export function showQuietNotice(msg: string, durationMs = 3500) {
  quietNotice.set(msg)
  setTimeout(() => quietNotice.set(null), durationMs)
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
