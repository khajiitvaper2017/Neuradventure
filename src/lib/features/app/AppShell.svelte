<script lang="ts">
  import { untrack } from "svelte"
  import { page } from "$app/state"
  import { registerSW } from "virtual:pwa-register"
  import { pwaInfo } from "virtual:pwa-info"

  import "@fontsource/geist-sans/latin.css"
  import "@fontsource/geist-mono/latin.css"
  import "@fontsource/spectral/latin.css"
  import "@/styles/app.css"

  import { activeScreen, navigate, routeStoryId, routeChatId, syncRouteFromUrl } from "@/stores/router"
  import {
    collapseCharSheet,
    collapseCharactersPanel,
    errorMessage,
    isDesktop,
    quietNotice,
    showError,
    showQuietNotice,
  } from "@/stores/ui"
  import { colorMode } from "@/stores/settings"
  import { currentStoryId, currentStoryModules } from "@/stores/game"
  import { currentChatId } from "@/stores/chat"
  import CharSheet from "@/features/character/CharSheet.svelte"
  import CharactersPanel from "@/features/character/CharactersPanel.svelte"
  import PwaPrompts from "@/components/overlays/PwaPrompts.svelte"
  import ConfirmDialog from "@/components/overlays/ConfirmDialog.svelte"
  import { loadStoryById } from "@/utils/storyLoader"
  import { loadChatById } from "@/utils/chatLoader"
  import { initEngine } from "@/services/initEngine"
  import { ctxLimitDetected, initSettings } from "@/stores/settings"
  import { getCtxLimitCached, initCtxLimit } from "@/llm"
  import { setPwaNeedRefresh, setPwaOfflineReady } from "@/stores/pwa"
  import { ensurePersistentStorage } from "@/utils/storagePersistence"
  import { cn } from "@/utils.js"
  import { Button } from "@/components/ui/button"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import { createRouteRestorer } from "@/features/app/routeRestore"

  let { children } = $props()

  let appEl: HTMLDivElement | null = null
  const SIDEBAR_WIDTH = 350
  const GAME_WIDTH = 800
  const HARD_RELOAD_GUARD_KEY = "neuradventure:hard-reload-reloaded"

  function isVisible(el: HTMLElement): boolean {
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length)
  }

  function pickScrollRoot(scope: ParentNode): HTMLElement | null {
    const modal = scope.querySelector<HTMLElement>('[data-scroll-root="modal"]')
    if (modal && isVisible(modal)) return modal
    const screen = scope.querySelector<HTMLElement>('[data-scroll-root="screen"]')
    if (screen && isVisible(screen)) return screen
    return null
  }

  function handleWheel(e: WheelEvent) {
    if (e.defaultPrevented) return
    const target = e.target as HTMLElement | null
    if (!appEl || !target) return
    if (target.closest("[data-scroll-root]")) return
    const root = pickScrollRoot(appEl)
    if (!root) return
    const max = root.scrollHeight - root.clientHeight
    if (max <= 0) return
    root.scrollTop = Math.max(0, Math.min(root.scrollTop + e.deltaY, max))
    e.preventDefault()
  }

  let restoringStory = $state(false)
  let restoringChat = $state(false)
  let bootstrapped = $state(false)
  let bootstrapError = $state<string | null>(null)
  const routeRestorer = createRouteRestorer()

  function updateThemeColor() {
    if (typeof document === "undefined") return
    const container = document.body ?? document.documentElement
    if (!container) return

    const probe = document.createElement("div")
    probe.style.position = "fixed"
    probe.style.left = "-9999px"
    probe.style.top = "-9999px"
    probe.style.visibility = "hidden"
    probe.style.pointerEvents = "none"
    probe.style.backgroundColor = "var(--background)"
    container.appendChild(probe)

    const computed = getComputedStyle(probe)
    const bgCss = computed.backgroundColor
    probe.remove()

    const themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (themeMeta) themeMeta.content = bgCss
  }

  $effect(() => {
    syncRouteFromUrl(page.url)
  })

  $effect(() => {
    const root = document.documentElement
    const mq = window.matchMedia("(prefers-color-scheme: dark)")

    const apply = () => {
      const mode = $colorMode
      const isDark = mode === "dark" || (mode === "system" && mq.matches)
      root.classList.toggle("dark", isDark)
      queueMicrotask(() => updateThemeColor())
    }

    apply()
    const onChange = () => apply()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  })

  $effect(() => {
    void routeRestorer.maybeRestoreStory({
      bootstrapped,
      activeScreen: $activeScreen,
      routeId: $routeStoryId,
      currentId: $currentStoryId,
      isRestoring: () => restoringStory,
      setRestoring: (next) => {
        restoringStory = next
      },
      load: loadStoryById,
      onError: () => {
        showError("Failed to load story")
        navigate("home", { replace: true, reset: true })
      },
    })
  })

  $effect(() => {
    void routeRestorer.maybeRestoreChat({
      bootstrapped,
      activeScreen: $activeScreen,
      routeId: $routeChatId,
      currentId: $currentChatId,
      isRestoring: () => restoringChat,
      setRestoring: (next) => {
        restoringChat = next
      },
      load: loadChatById,
      onError: () => {
        showError("Failed to load chat")
        navigate("home", { replace: true, reset: true })
      },
    })
  })

  let gameActive = $derived($activeScreen === "game")
  let gameReady = $derived(gameActive && !restoringStory && $currentStoryId !== null)
  let desktopGame = $derived(gameReady && $isDesktop)
  let trackNpcs = $derived($currentStoryModules?.track_npcs ?? true)

  let gridStyle = $derived.by(() => {
    if (!desktopGame) return undefined
    const left = $collapseCharSheet ? 0 : SIDEBAR_WIDTH
    const right = $collapseCharactersPanel || !trackNpcs ? 0 : SIDEBAR_WIDTH
    return `grid-template-columns:${left}px minmax(0, ${GAME_WIDTH}px) ${right}px;grid-template-rows:100dvh;`
  })

  function bootstrapPwa() {
    const updateServiceWorker = registerSW({
      onNeedRefresh() {
        setPwaNeedRefresh(updateServiceWorker)
      },
      onOfflineReady() {
        setPwaOfflineReady()
        showQuietNotice("Offline ready")
      },
    })
  }

  async function hardReload(options: { guarded: boolean } = { guarded: true }) {
    if (typeof window === "undefined") return

    if (options.guarded) {
      try {
        if (typeof sessionStorage !== "undefined") {
          if (sessionStorage.getItem(HARD_RELOAD_GUARD_KEY)) return
          sessionStorage.setItem(HARD_RELOAD_GUARD_KEY, "1")
        }
      } catch {
        // Ignore storage failures and continue with cleanup.
      }
    } else if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.removeItem(HARD_RELOAD_GUARD_KEY)
      } catch {
        // ignore
      }
    }

    try {
      if ("serviceWorker" in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations()
        await Promise.all(registrations.map((registration) => registration.unregister()))
      }
    } catch (err) {
      console.warn("[cache] Failed to unregister service workers", err)
    }

    try {
      if ("caches" in window) {
        const keys = await caches.keys()
        await Promise.all(keys.map((key) => caches.delete(key)))
      }
    } catch (err) {
      console.warn("[cache] Failed to clear caches", err)
    }

    try {
      if (typeof localStorage !== "undefined") {
        const pendingKeys: string[] = []
        for (let i = 0; i < localStorage.length; i += 1) {
          const key = localStorage.key(i)
          if (key?.startsWith("pending_request_v1:")) pendingKeys.push(key)
        }
        for (const key of pendingKeys) {
          localStorage.removeItem(key)
        }
      }
    } catch (err) {
      console.warn("[cache] Failed to clear pending requests", err)
    }

    const nextUrl = new URL(location.href)
    nextUrl.searchParams.set("reload", Date.now().toString())
    location.replace(nextUrl.toString())
  }

  function handleVitePreloadError(event: Event) {
    event.preventDefault()
    void hardReload({ guarded: true })
  }

  async function forceHardReload() {
    if (typeof window === "undefined") return

    await hardReload({ guarded: false })
  }

  async function bootstrap() {
    bootstrapped = false
    bootstrapError = null
    try {
      const status = await ensurePersistentStorage()
      if (status.supported && !status.granted) {
        console.warn("[storage] Persistent storage not granted; browser may evict caches/DB under pressure.")
      }
    } catch (err) {
      console.warn("[storage] Failed to request persistent storage", err)
    }

    try {
      await initEngine()
    } catch (err) {
      console.error("[engine] Failed to initialize local engine", err)
      bootstrapError = "Failed to initialize local database."
      return
    }

    try {
      await initSettings()
    } catch (err) {
      console.error("[settings] Failed to initialize settings", err)
    }

    bootstrapped = true
    if (typeof sessionStorage !== "undefined") {
      try {
        sessionStorage.removeItem(HARD_RELOAD_GUARD_KEY)
      } catch {
        // ignore
      }
    }

    // Detect context length in the background (network-dependent).
    void initCtxLimit()
      .then(() => ctxLimitDetected.set(getCtxLimitCached()))
      .catch(() => {
        // ignore
      })
  }

  $effect(() => {
    return untrack(() => {
      const onVitePreloadError = (event: Event) => handleVitePreloadError(event)

      window.addEventListener("vite:preloadError", onVitePreloadError)
      bootstrapPwa()
      void bootstrap()

      return () => window.removeEventListener("vite:preloadError", onVitePreloadError)
    })
  })
</script>

<svelte:head>
  {#if pwaInfo}
    <link
      rel="manifest"
      href={pwaInfo.webManifest.href}
      crossorigin={pwaInfo.webManifest.useCredentials ? "use-credentials" : undefined}
    />
  {/if}
</svelte:head>

<svelte:window
  onwheel={handleWheel}
  onerror={(e) => {
    const evt = e as unknown as ErrorEvent
    console.error("[uncaught]", evt.error ?? evt.message)
  }}
  onunhandledrejection={(e) => {
    const evt = e as unknown as PromiseRejectionEvent
    if (evt.reason === null || evt.reason === undefined) return
    if (evt.reason instanceof Error) {
      console.error("[unhandled promise]", evt.reason, evt.reason.stack)
      return
    }
    console.error("[unhandled promise]", evt.reason)
  }}
/>

<div
  class={cn(
    "relative h-dvh w-full overflow-hidden bg-background text-foreground",
    desktopGame && "mx-auto grid max-w-[1800px] justify-center",
  )}
  style={gridStyle}
  bind:this={appEl}
>
  {#if bootstrapped}
    {#if gameActive}
      {#if $isDesktop && !$collapseCharSheet && gameReady}
        <div class="col-start-1 h-dvh overflow-hidden border-r bg-card">
          <CharSheet inline lockKey="player" />
        </div>
      {/if}

      <div class={cn(desktopGame && "col-start-2", "min-w-0")}>
        {#if gameReady}
          {@render children()}
        {:else}
          <div class="p-4 text-sm text-muted-foreground">Loading story…</div>
        {/if}
      </div>

      {#if $isDesktop && !$collapseCharactersPanel && trackNpcs && gameReady}
        <div class="col-start-3 h-dvh overflow-hidden border-l bg-card">
          <CharactersPanel inline />
        </div>
      {/if}
    {:else}
      {@render children()}
    {/if}

    <CharSheet />
    {#if trackNpcs}
      <CharactersPanel />
    {/if}
  {:else}
    <ScrollArea class="h-full w-full">
      <div class="grid gap-3 p-6 text-muted-foreground">
        {#if bootstrapError}
          <h1 class="text-base font-semibold text-foreground">Initialization failed</h1>
          <p class="text-sm leading-relaxed">{bootstrapError}</p>
          <div class="w-fit">
            <Button
              type="button"
              variant="outline"
              onclick={() => {
                void forceHardReload()
              }}
            >
              Hard reload
            </Button>
          </div>
        {:else}
          <div class="text-sm">Loading…</div>
        {/if}
      </div>
    </ScrollArea>
  {/if}

  {#if $errorMessage}
    <div
      class="fixed bottom-4 left-1/2 z-50 w-[min(92vw,40rem)] -translate-x-1/2 rounded-md border bg-background/95 px-4 py-3 text-sm shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      {$errorMessage}
    </div>
  {/if}

  {#if $quietNotice}
    <div
      class="fixed bottom-4 right-4 z-50 max-w-[min(92vw,20rem)] rounded-md border bg-background/95 px-3 py-2 text-xs text-muted-foreground shadow-md backdrop-blur supports-[backdrop-filter]:bg-background/60"
    >
      {$quietNotice}
    </div>
  {/if}

  <PwaPrompts />
  <ConfirmDialog />
</div>
