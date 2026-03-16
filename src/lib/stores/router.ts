import { writable, get, type Writable } from "svelte/store"
import { goto, pushState, replaceState } from "$app/navigation"
import { resetActiveStory, resetGame } from "@/stores/game"
import { resetChat } from "@/stores/chat"

export type Screen = "home" | "char-create" | "new-story" | "new-chat" | "game" | "chat" | "settings"

type Panel = "charsheet" | "npcs" | "locations"

type RouteState = {
  screen: Screen
  storyId: number | null
  chatId: number | null
  panel: Panel | null
  characterId: number | null
}

type PanelHistoryState = { na_panel?: true }

export const activeScreen = writable<Screen>("home")
export const routeStoryId = writable<number | null>(null)
export const routeChatId = writable<number | null>(null)

const panelState = writable<{ panel: Panel | null; characterId: number | null }>({ panel: null, characterId: null })

export const charSheetCharacterId = {
  subscribe: (run: (value: number | null) => void) =>
    panelState.subscribe((s) => run(s.panel === "charsheet" ? s.characterId : null)),
}

function parseScreen(pathname: string): Screen {
  const path = pathname.replace(/\/+$/, "") || "/"
  if (path === "/") return "home"
  if (path === "/game") return "game"
  if (path === "/chat") return "chat"
  if (path === "/stories/new") return "new-story"
  if (path === "/chats/new") return "new-chat"
  if (path === "/characters/new") return "char-create"
  if (path === "/settings") return "settings"
  return "home"
}

function asPositiveInt(raw: string | null): number | null {
  if (!raw) return null
  const parsed = Number(raw)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return Math.trunc(parsed)
}

function parsePanel(raw: string | null): Panel | null {
  if (raw === "charsheet" || raw === "npcs" || raw === "locations") return raw
  return null
}

function parseRouteFromUrl(url: URL): RouteState {
  const screen = parseScreen(url.pathname)
  const storyId = screen === "game" ? asPositiveInt(url.searchParams.get("story")) : null
  const chatId = screen === "chat" ? asPositiveInt(url.searchParams.get("chat")) : null

  const panel = parsePanel(url.searchParams.get("panel"))
  const characterId = asPositiveInt(url.searchParams.get("character"))

  // Panels are mostly game-only, but the character sheet is also used as an inspector on other screens.
  const allowedPanel =
    panel === "charsheet"
      ? screen === "game"
        ? "charsheet"
        : characterId
          ? "charsheet"
          : null
      : screen === "game"
        ? panel
        : null

  return {
    screen,
    storyId,
    chatId,
    panel: allowedPanel,
    characterId: allowedPanel === "charsheet" ? (screen === "game" ? null : characterId) : null,
  }
}

function buildHref(state: Pick<RouteState, "screen" | "storyId" | "chatId">): string {
  const { screen, storyId, chatId } = state
  if (screen === "home") return "/"
  if (screen === "settings") return "/settings"
  if (screen === "char-create") return "/characters/new"
  if (screen === "new-story") return "/stories/new"
  if (screen === "new-chat") return "/chats/new"
  if (screen === "game") return storyId ? `/game?story=${encodeURIComponent(String(storyId))}` : "/"
  if (screen === "chat") return chatId ? `/chat?chat=${encodeURIComponent(String(chatId))}` : "/"
  return "/"
}

function currentUrl(): URL | null {
  if (typeof window === "undefined") return null
  try {
    return new URL(window.location.href)
  } catch {
    return null
  }
}

function canonicalizePanel(url: URL): URL {
  const parsed = parseRouteFromUrl(url)
  if (!parsed.panel) {
    url.searchParams.delete("panel")
    url.searchParams.delete("character")
    return url
  }
  url.searchParams.set("panel", parsed.panel)
  if (parsed.panel === "charsheet" && parsed.screen !== "game" && parsed.characterId) {
    url.searchParams.set("character", String(parsed.characterId))
  } else {
    url.searchParams.delete("character")
  }
  return url
}

function syncStores(route: RouteState) {
  activeScreen.set(route.screen)
  routeStoryId.set(route.storyId)
  routeChatId.set(route.chatId)
  panelState.set({ panel: route.panel, characterId: route.characterId })
}

export function syncRouteFromUrl(url: URL) {
  syncStores(parseRouteFromUrl(url))

  // Canonicalize invalid/unsupported panel params without adding history entries.
  const current = currentUrl()
  if (!current) return
  const canon = canonicalizePanel(new URL(current))
  if (canon.href !== current.href) replaceState(canon, {})
}

export function navigate(
  screen: Screen,
  options: { replace?: boolean; reset?: boolean; params?: { storyId?: number; chatId?: number } } = {},
) {
  const nextStoryId = screen === "game" ? (options.params?.storyId ?? get(routeStoryId)) : null
  const nextChatId = screen === "chat" ? (options.params?.chatId ?? get(routeChatId)) : null
  const nextScreen = (screen === "game" && !nextStoryId) || (screen === "chat" && !nextChatId) ? "home" : screen

  if (options.reset) {
    if (nextScreen === "home") {
      resetGame()
      resetChat()
    } else if (nextScreen === "game") {
      resetActiveStory()
    } else if (nextScreen === "chat") {
      resetChat()
    } else if (nextScreen === "new-chat") {
      resetChat()
    } else if (nextScreen === "new-story" || nextScreen === "char-create") {
      resetActiveStory()
    }
  }

  // Always clear panels on primary navigation.
  if (typeof window !== "undefined") {
    const url = currentUrl()
    if (url) {
      panelState.set({ panel: null, characterId: null })
      url.searchParams.delete("panel")
      url.searchParams.delete("character")
      replaceState(url, {})
    }
  }

  const href = buildHref({ screen: nextScreen, storyId: nextStoryId, chatId: nextChatId })
  void goto(href, { replaceState: !!options.replace, keepFocus: true, noScroll: false })
}

export function goBack(fallback: Screen = "home") {
  if (typeof history !== "undefined" && history.length > 1) {
    history.back()
    return
  }
  navigate(fallback, { replace: true })
}

function setPanel(panel: Panel | null, characterId: number | null, mode: "push" | "replace") {
  const url = currentUrl()
  if (!url) return

  const screen = get(activeScreen)
  panelState.set({
    panel,
    characterId: panel === "charsheet" && screen !== "game" ? characterId : null,
  })

  const next = new URL(url)
  if (!panel) {
    next.searchParams.delete("panel")
    next.searchParams.delete("character")
  } else {
    next.searchParams.set("panel", panel)
    if (panel === "charsheet" && get(activeScreen) !== "game" && characterId) {
      next.searchParams.set("character", String(characterId))
    } else {
      next.searchParams.delete("character")
    }
  }

  const state: PanelHistoryState = panel ? { na_panel: true } : {}
  if (mode === "push") pushState(next, state)
  else replaceState(next, state)
}

function closePanel() {
  if (typeof history === "undefined") return
  panelState.set({ panel: null, characterId: null })
  const state = history.state as PanelHistoryState | null
  if (state?.na_panel) {
    history.back()
    return
  }
  setPanel(null, null, "replace")
}

function makePanelToggle(target: Panel, options: { requireGame?: boolean } = {}): Writable<boolean> {
  return {
    subscribe: (run) => panelState.subscribe((s) => run(s.panel === target)),
    set: (next) => {
      if (next) {
        if (options.requireGame && get(activeScreen) !== "game") return
        setPanel(target, null, "push")
      } else {
        closePanel()
      }
    },
    update: (fn) => {
      const current = get(panelState).panel === target
      const next = fn(current)
      if (next) {
        if (options.requireGame && get(activeScreen) !== "game") return false
        setPanel(target, null, "push")
        return true
      }
      closePanel()
      return false
    },
  }
}

export const showCharSheet = makePanelToggle("charsheet")
export const showNPCTracker = makePanelToggle("npcs", { requireGame: true })
export const showLocations = makePanelToggle("locations", { requireGame: true })

export function openCharSheetForCharacter(id: number) {
  const safe = asPositiveInt(String(id))
  if (!safe) return
  // Inspector mode relies on the character id outside the game screen.
  if (get(activeScreen) === "game") {
    setPanel("charsheet", null, "push")
    return
  }
  setPanel("charsheet", safe, "push")
}

export function closeCharSheet() {
  if (get(panelState).panel === "charsheet") closePanel()
}
