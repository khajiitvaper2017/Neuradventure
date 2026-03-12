<script lang="ts">
  import { onMount } from "svelte"
  import {
    activeScreen,
    errorMessage,
    initRouter,
    isDesktop,
    navigate,
    quietNotice,
    routeStoryId,
    showError,
  } from "./stores/ui.js"
  import { theme, design, textJustify, colorScheme, initSettings } from "./stores/settings.js"
  import { currentStoryId } from "./stores/game.js"
  import HomeScreen from "./screens/HomeScreen.svelte"
  import GameScreen from "./screens/GameScreen.svelte"
  import CharCreate from "./components/ui/CharCreate.svelte"
  import NewStory from "./components/ui/NewStory.svelte"
  import CharSheet from "./components/ui/CharSheet.svelte"
  import NPCTracker from "./components/ui/NPCTracker.svelte"
  import LocationsPanel from "./components/ui/LocationsPanel.svelte"
  import Settings from "./components/ui/Settings.svelte"
  import ConfirmDialog from "./components/ui/ConfirmDialog.svelte"
  import { loadStoryById } from "./utils/storyLoader.js"

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

  let appReady = $state(false)
  let restoringStory = $state(false)

  onMount(() => {
    initRouter()
    initSettings().finally(() => {
      appReady = true
    })
    window.addEventListener("wheel", handleWheel, { passive: false })
    return () => window.removeEventListener("wheel", handleWheel)
  })

  let gameActive = $derived($activeScreen === "game")
  let gameReady = $derived(gameActive && !restoringStory && $currentStoryId !== null)
  let desktopGame = $derived(gameReady && $isDesktop)

  $effect(() => {
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
</script>

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
  bind:this={appEl}
>
  {#if appReady}
    {#if gameReady}
      {#if $isDesktop}
        <CharSheet inline />
      {/if}

      <GameScreen />

      {#if $isDesktop}
        <NPCTracker inline />
        <LocationsPanel inline />
      {/if}
    {:else if !gameActive}
      {#if $activeScreen === "home"}
        <HomeScreen />
      {:else if $activeScreen === "char-create"}
        <CharCreate />
      {:else if $activeScreen === "new-story"}
        <NewStory />
      {:else if $activeScreen === "settings"}
        <Settings />
      {/if}
    {/if}

    <CharSheet />
    <NPCTracker />
    <LocationsPanel />
  {/if}

  {#if $errorMessage}
    <div class="toast">{$errorMessage}</div>
  {/if}

  {#if $quietNotice}
    <div class="corner-note">{$quietNotice}</div>
  {/if}

  <ConfirmDialog />
</div>

<style>
  .app {
    height: 100dvh;
    position: relative;
    background: var(--bg);
  }

  /* ── Desktop game: three-column grid ──────────────── */
  .app.game-active {
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr) var(--sidebar-width) var(--sidebar-width);
    grid-template-rows: 100dvh;
    max-width: 1800px;
    margin: 0 auto;
  }

  /* ── Toast ────────────────────────────────────────── */
  .toast {
    position: fixed;
    bottom: 90px;
    left: 50%;
    transform: translateX(-50%);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    padding: 0.65rem 1.25rem;
    color: var(--text);
    font-size: 0.85rem;
    font-family: var(--font-ui);
    z-index: 200;
    max-width: min(88vw, 380px);
    text-align: center;
    animation: toastIn 0.2s ease;
    pointer-events: none;
  }

  @keyframes toastIn {
    from {
      opacity: 0;
      transform: translate(-50%, 8px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  /* ── Corner notice ─────────────────────────────────── */
  .corner-note {
    position: fixed;
    right: 16px;
    bottom: 16px;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 0.72rem;
    font-family: var(--font-ui);
    padding: 0.4rem 0.6rem;
    border-radius: 6px;
    z-index: 190;
    opacity: 0.85;
    pointer-events: none;
    animation: toastIn 0.2s ease;
  }
</style>
