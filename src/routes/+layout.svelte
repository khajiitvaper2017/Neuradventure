<script lang="ts">
  import { onMount } from "svelte"
  import { page } from "$app/stores"
  import { registerSW } from "virtual:pwa-register"
  import { pwaInfo } from "virtual:pwa-info"

  import "@fontsource/geist-sans/latin.css"
  import "@fontsource/geist-mono/latin.css"
  import "@fontsource/cinzel/latin.css"
  import "@/styles/app.css"

  import {
    activeScreen,
    collapseCharSheet,
    collapseLocationsPanel,
    collapseNPCTracker,
    errorMessage,
    isDesktop,
    navigate,
    quietNotice,
    routeStoryId,
    routeChatId,
    showError,
    showQuietNotice,
    syncRouteFromUrl,
  } from "@/stores/ui"
  import { colorMode } from "@/stores/settings"
  import { currentStoryId, currentStoryModules } from "@/stores/game"
  import { currentChatId } from "@/stores/chat"
  import CharSheet from "@/features/character/CharSheet.svelte"
  import NPCTracker from "@/features/npc/NPCTracker.svelte"
  import LocationsPanel from "@/components/panels/LocationsPanel.svelte"
  import PwaPrompts from "@/components/overlays/PwaPrompts.svelte"
  import ConfirmDialog from "@/components/overlays/ConfirmDialog.svelte"
  import { loadStoryById } from "@/utils/storyLoader"
  import { loadChatById } from "@/utils/chatLoader"
  import { initEngine } from "@/engine"
  import { ctxLimitDetected, initSettings } from "@/stores/settings"
  import { getCtxLimitCached, initCtxLimit } from "@/engine/llm"
  import { setPwaNeedRefresh, setPwaOfflineReady } from "@/stores/pwa"
  import { ensurePersistentStorage } from "@/utils/storagePersistence"
  import { cn } from "@/utils.js"
  import { Button } from "@/components/ui/button"
  import { ScrollArea } from "@/components/ui/scroll-area"

  let { children } = $props()

  let appEl: HTMLDivElement | null = null
  const SIDEBAR_WIDTH = 350
  const GAME_WIDTH = 800

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

  function updateSiteIcon() {
    if (typeof document === "undefined") return
    if (!appEl) return

    const computed = getComputedStyle(appEl)
    const bg = computed.getPropertyValue("--background").trim() || "0 0% 0%"
    const primary = computed.getPropertyValue("--primary").trim() || "0 0% 100%"
    const border = computed.getPropertyValue("--border").trim() || "0 0% 50%"

    const bgCss = `hsl(${bg})`
    const primaryCss = `hsl(${primary})`
    const borderCss = `hsl(${border})`

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bgCss}"/><rect x="1.5" y="1.5" width="61" height="61" rx="12.5" fill="none" stroke="${borderCss}" stroke-width="3"/><path d="M18 46V18h6l16 20V18h6v28h-6L24 26v20z" fill="${primaryCss}"/></svg>`
    const href = `data:image/svg+xml,${encodeURIComponent(svg)}`

    let link = document.querySelector('link[rel="icon"][data-neuradventure="dynamic"]') as HTMLLinkElement | null
    if (!link) {
      link = document.createElement("link")
      link.rel = "icon"
      link.setAttribute("data-neuradventure", "dynamic")
      document.head.appendChild(link)
    }
    link.type = "image/svg+xml"
    link.href = href

    const themeMeta = document.querySelector('meta[name="theme-color"]') as HTMLMetaElement | null
    if (themeMeta) themeMeta.content = bgCss
  }

  $effect(() => {
    syncRouteFromUrl($page.url)
  })

  $effect(() => {
    void $colorMode
    queueMicrotask(() => updateSiteIcon())
  })

  $effect(() => {
    if (typeof window === "undefined") return
    const root = document.documentElement
    const mq = window.matchMedia("(prefers-color-scheme: dark)")

    const apply = () => {
      const mode = $colorMode
      const isDark = mode === "dark" || (mode === "system" && mq.matches)
      root.classList.toggle("dark", isDark)
    }

    apply()
    const onChange = () => apply()
    mq.addEventListener("change", onChange)
    return () => mq.removeEventListener("change", onChange)
  })

  $effect(() => {
    if (!bootstrapped) return
    if ($activeScreen !== "game") return
    if (!$routeStoryId) return
    if ($currentStoryId === $routeStoryId) return
    if (restoringStory) return
    restoringStory = true
    void loadStoryById($routeStoryId)
      .catch(() => {
        showError("Failed to load story")
        navigate("home", { replace: true, reset: true })
      })
      .finally(() => {
        restoringStory = false
      })
  })

  $effect(() => {
    if (!bootstrapped) return
    if ($activeScreen !== "chat") return
    if (!$routeChatId) return
    if ($currentChatId === $routeChatId) return
    if (restoringChat) return
    restoringChat = true
    void loadChatById($routeChatId)
      .catch(() => {
        showError("Failed to load chat")
        navigate("home", { replace: true, reset: true })
      })
      .finally(() => {
        restoringChat = false
      })
  })

  let gameActive = $derived($activeScreen === "game")
  let gameReady = $derived(gameActive && !restoringStory && $currentStoryId !== null)
  let desktopGame = $derived(gameReady && $isDesktop)
  let trackNpcs = $derived($currentStoryModules?.track_npcs ?? true)
  let trackLocations = $derived($currentStoryModules?.track_locations ?? true)

  let gridStyle = $derived.by(() => {
    if (!desktopGame) return undefined
    const left = $collapseCharSheet ? 0 : SIDEBAR_WIDTH
    const right1 = $collapseNPCTracker || !trackNpcs ? 0 : SIDEBAR_WIDTH
    const right2 = $collapseLocationsPanel || !trackLocations ? 0 : SIDEBAR_WIDTH
    return `grid-template-columns:${left}px minmax(0, ${GAME_WIDTH}px) ${right1}px ${right2}px;grid-template-rows:100dvh;`
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

    // Detect context length in the background (network-dependent).
    void initCtxLimit()
      .then(() => ctxLimitDetected.set(getCtxLimitCached()))
      .catch(() => {
        // ignore
      })
  }

  onMount(() => {
    bootstrapPwa()
    void bootstrap()
  })
</script>

<svelte:head>
  {@html pwaInfo?.webManifest.linkTag ?? ""}
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
        <div class="h-dvh overflow-hidden border-r bg-card">
          <CharSheet inline />
        </div>
      {/if}

      <div class={desktopGame ? "" : ""}>
        {#if gameReady}
          {@render children()}
        {:else}
          <div class="p-4 text-sm text-muted-foreground">Loading story…</div>
        {/if}
      </div>

      {#if $isDesktop && !$collapseNPCTracker && trackNpcs && gameReady}
        <div class="h-dvh overflow-hidden border-l bg-card">
          <NPCTracker inline />
        </div>
      {/if}

      {#if $isDesktop && !$collapseLocationsPanel && trackLocations && gameReady}
        <div class="h-dvh overflow-hidden border-l bg-card">
          <LocationsPanel inline />
        </div>
      {/if}
    {:else}
      {@render children()}
    {/if}

    <CharSheet />
    {#if trackNpcs}
      <NPCTracker />
    {/if}
    {#if trackLocations}
      <LocationsPanel />
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
                if (typeof location !== "undefined") location.reload()
              }}
            >
              Reload
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
