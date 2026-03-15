<script lang="ts">
  import { onMount } from "svelte"
  import { page } from "$app/stores"
  import { registerSW } from "virtual:pwa-register"
  import { pwaInfo } from "virtual:pwa-info"

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
  import { theme, design, textJustify, colorScheme } from "@/stores/settings"
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

  let { children } = $props()

  let appEl: HTMLDivElement | null = null

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
    const bg = computed.getPropertyValue("--bg").trim() || "#000000"
    const accent = computed.getPropertyValue("--accent").trim() || "#c85c5c"
    const border = computed.getPropertyValue("--border").trim() || "rgba(255, 255, 255, 0.12)"

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${bg}"/><rect x="1.5" y="1.5" width="61" height="61" rx="12.5" fill="none" stroke="${border}" stroke-width="3"/><path d="M18 46V18h6l16 20V18h6v28h-6L24 26v20z" fill="${accent}"/></svg>`
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
    if (themeMeta) themeMeta.content = bg
  }

  $effect(() => {
    syncRouteFromUrl($page.url)
  })

  $effect(() => {
    void $theme
    void $colorScheme
    queueMicrotask(() => updateSiteIcon())
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
  class="app"
  class:theme-amoled={$theme === "amoled"}
  class:design-roboto={$design === "roboto"}
  class:text-justify={$textJustify}
  class:scheme-gold={$colorScheme === "gold"}
  class:scheme-emerald={$colorScheme === "emerald"}
  class:scheme-sapphire={$colorScheme === "sapphire"}
  class:scheme-crimson={$colorScheme === "crimson"}
  class:game-active={desktopGame}
  class:collapse-char={$collapseCharSheet}
  class:collapse-npc={$collapseNPCTracker || !trackNpcs}
  class:collapse-locations={$collapseLocationsPanel || !trackLocations}
  bind:this={appEl}
>
  {#if bootstrapped}
    {#if gameActive}
      {#if $isDesktop && !$collapseCharSheet && gameReady}
        <div class="sidebar-slot left">
          <CharSheet inline />
        </div>
      {/if}

      <div class="game-slot">
        {#if gameReady}
          {@render children()}
        {:else}
          <div style="padding: 16px; color: var(--text-dim)">Loading story…</div>
        {/if}
      </div>

      {#if $isDesktop && !$collapseNPCTracker && trackNpcs && gameReady}
        <div class="sidebar-slot right-1">
          <NPCTracker inline />
        </div>
      {/if}

      {#if $isDesktop && !$collapseLocationsPanel && trackLocations && gameReady}
        <div class="sidebar-slot right-2">
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
    <div class="boot-screen" data-scroll-root="screen">
      {#if bootstrapError}
        <h1 class="boot-title">Initialization failed</h1>
        <p class="boot-text">{bootstrapError}</p>
        <button
          type="button"
          class="btn-ghost"
          onclick={() => {
            if (typeof location !== "undefined") location.reload()
          }}
        >
          Reload
        </button>
      {:else}
        <div class="boot-text">Loading…</div>
      {/if}
    </div>
  {/if}

  {#if $errorMessage}
    <div class="toast">{$errorMessage}</div>
  {/if}

  {#if $quietNotice}
    <div class="corner-note">{$quietNotice}</div>
  {/if}

  <PwaPrompts />
  <ConfirmDialog />
</div>

<style>
  .app {
    height: 100dvh;
    position: relative;
    background: var(--bg);
  }

  .boot-screen {
    padding: 22px 16px;
    color: var(--text-dim);
    display: grid;
    gap: 12px;
    align-content: start;
  }

  .boot-title {
    margin: 0;
    font-size: 1.05rem;
    color: var(--text);
    letter-spacing: 0.01em;
  }

  .boot-text {
    margin: 0;
    max-width: 64ch;
    line-height: 1.45;
  }

  /* ── Desktop game: three-column grid ──────────────── */
  .app.game-active {
    --sidebar-left: var(--sidebar-width);
    --sidebar-right-1: var(--sidebar-width);
    --sidebar-right-2: var(--sidebar-width);
    --game-width: 800px;
    display: grid;
    justify-content: center;
    grid-template-columns:
      var(--sidebar-left) minmax(0, var(--game-width)) var(--sidebar-right-1)
      var(--sidebar-right-2);
    grid-template-rows: 100dvh;
    max-width: 1800px;
    margin: 0 auto;
  }
  .app.game-active .game-slot {
    grid-column: 2;
    min-width: 0;
  }
  .app.game-active .sidebar-slot {
    height: 100dvh;
  }
  .app.game-active .sidebar-slot.left {
    grid-column: 1;
  }
  .app.game-active .sidebar-slot.right-1 {
    grid-column: 3;
  }
  .app.game-active .sidebar-slot.right-2 {
    grid-column: 4;
  }
  .app.game-active.collapse-char {
    --sidebar-left: 0px;
  }
  .app.game-active.collapse-npc {
    --sidebar-right-1: 0px;
  }
  .app.game-active.collapse-locations {
    --sidebar-right-2: 0px;
  }

  /* Toast + corner-note styles live in shared.css */
</style>
