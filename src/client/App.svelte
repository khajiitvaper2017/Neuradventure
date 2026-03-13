<script lang="ts">
  import { onMount } from "svelte"
  import {
    activeScreen,
    collapseCharSheet,
    collapseLocationsPanel,
    collapseNPCTracker,
    errorMessage,
    initRouter,
    isDesktop,
    navigate,
    quietNotice,
    routeStoryId,
    routeChatId,
    showError,
  } from "./stores/ui.js"
  import { theme, design, textJustify, colorScheme, initSettings } from "./stores/settings.js"
  import { currentStoryId, currentStoryModules } from "./stores/game.js"
  import { currentChatId } from "./stores/chat.js"
  import HomeScreen from "./features/home/HomeScreen.svelte"
  import GameScreen from "./features/game/GameScreen.svelte"
  import ChatScreen from "./features/chat/ChatScreen.svelte"
  import CharCreate from "./features/character/CharCreate.svelte"
  import NewStory from "./features/story/NewStory.svelte"
  import NewChat from "./features/chat/NewChat.svelte"
  import CharSheet from "./features/character/CharSheet.svelte"
  import NPCTracker from "./features/npc/NPCTracker.svelte"
  import LocationsPanel from "./components/ui/LocationsPanel.svelte"
  import Settings from "./features/settings/Settings.svelte"
  import ConfirmDialog from "./components/ui/ConfirmDialog.svelte"
  import { loadStoryById } from "./utils/storyLoader.js"
  import { loadChatById } from "./utils/chatLoader.js"

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
  let restoringChat = $state(false)

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
  let trackNpcs = $derived($currentStoryModules?.track_npcs ?? true)
  let trackLocations = $derived($currentStoryModules?.track_locations ?? true)

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

  $effect(() => {
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
  class:collapse-char={$collapseCharSheet}
  class:collapse-npc={$collapseNPCTracker || !trackNpcs}
  class:collapse-locations={$collapseLocationsPanel || !trackLocations}
  bind:this={appEl}
>
  {#if appReady}
    {#if gameReady}
      {#if $isDesktop && !$collapseCharSheet}
        <div class="sidebar-slot left">
          <CharSheet inline />
        </div>
      {/if}

      <div class="game-slot">
        <GameScreen />
      </div>

      {#if $isDesktop && !$collapseNPCTracker && trackNpcs}
        <div class="sidebar-slot right-1">
          <NPCTracker inline />
        </div>
      {/if}

      {#if $isDesktop && !$collapseLocationsPanel && trackLocations}
        <div class="sidebar-slot right-2">
          <LocationsPanel inline />
        </div>
      {/if}
    {:else if !gameActive}
      {#if $activeScreen === "home"}
        <HomeScreen />
      {:else if $activeScreen === "char-create"}
        <CharCreate />
      {:else if $activeScreen === "new-story"}
        <NewStory />
      {:else if $activeScreen === "new-chat"}
        <NewChat />
      {:else if $activeScreen === "chat"}
        <ChatScreen />
      {:else if $activeScreen === "settings"}
        <Settings />
      {/if}
    {/if}

    <CharSheet />
    {#if trackNpcs}
      <NPCTracker />
    {/if}
    {#if trackLocations}
      <LocationsPanel />
    {/if}
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
