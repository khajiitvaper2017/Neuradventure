<script lang="ts">
  import { api } from "../../api/client.js"
  import IconDots from "../../components/icons/IconDots.svelte"
  import IconMapPin from "../../components/icons/IconMapPin.svelte"
  import IconUser from "../../components/icons/IconUser.svelte"
  import IconUsers from "../../components/icons/IconUsers.svelte"
  import {
    collapseCharSheet,
    collapseLocationsPanel,
    collapseNPCTracker,
    showCharSheet,
    showLocations,
    showNPCTracker,
  } from "../../stores/ui.js"
  import { currentStoryId, currentStoryModules, currentStoryTitle, turns, worldState } from "../../stores/game.js"

  export let flashScene = false
  export let onGoHome: (() => void) | undefined = undefined
  export let onOpenMemoryEditor: (() => void) | undefined = undefined
  export let onOpenAuthorNoteEditor: (() => void) | undefined = undefined
  export let onOpenModulesEditor: (() => void) | undefined = undefined

  let showMenu = false
  let trackNpcs = true
  let trackLocations = true
  $: trackNpcs = $currentStoryModules?.track_npcs ?? true
  $: trackLocations = $currentStoryModules?.track_locations ?? true

  function openAndClose(fn: (() => void) | undefined) {
    showMenu = false
    fn?.()
  }
</script>

<header>
  <button class="header-back" onclick={onGoHome} title="Return to menu" aria-label="Back to stories">
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="2"
      stroke-linecap="round"
      aria-hidden="true"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg
    >
  </button>

  <div class="header-center">
    <span class="story-name">{$currentStoryTitle}</span>
    {#if $worldState}
      <span class="header-scene" class:flash={flashScene}>
        {$worldState.current_scene} · {$worldState.time_of_day}
      </span>
    {/if}
  </div>

  <div class="header-actions">
    <span class="turn-badge">{$turns.length}</span>
    <button
      class="hbtn desktop-only"
      class:inactive={$collapseCharSheet}
      title={$collapseCharSheet ? "Show character sheet" : "Hide character sheet"}
      onclick={() => collapseCharSheet.update((v) => !v)}
    >
      <IconUser size={15} strokeWidth={1.8} />
    </button>
    {#if trackNpcs}
      <button
        class="hbtn desktop-only"
        class:inactive={$collapseNPCTracker}
        title={$collapseNPCTracker ? "Show NPC tracker" : "Hide NPC tracker"}
        onclick={() => collapseNPCTracker.update((v) => !v)}
      >
        <IconUsers size={15} strokeWidth={1.8} />
      </button>
    {/if}
    {#if trackLocations}
      <button
        class="hbtn desktop-only"
        class:inactive={$collapseLocationsPanel}
        title={$collapseLocationsPanel ? "Show locations" : "Hide locations"}
        onclick={() => collapseLocationsPanel.update((v) => !v)}
      >
        <IconMapPin size={15} strokeWidth={1.8} />
      </button>
    {/if}
    <button class="hbtn mobile-only" title="Character Sheet" onclick={() => showCharSheet.update((v) => !v)}>
      <IconUser size={15} strokeWidth={1.8} />
    </button>
    {#if trackNpcs}
      <button class="hbtn mobile-only" title="NPC Tracker" onclick={() => showNPCTracker.update((v) => !v)}>
        <IconUsers size={15} strokeWidth={1.8} />
      </button>
    {/if}
    {#if trackLocations}
      <button class="hbtn mobile-only" title="Locations" onclick={() => showLocations.update((v) => !v)}>
        <IconMapPin size={15} strokeWidth={1.8} />
      </button>
    {/if}
    <div class="menu-wrap">
      <button class="hbtn" aria-label="More options" onclick={() => (showMenu = !showMenu)}>
        <IconDots size={15} strokeWidth={1.8} />
      </button>
      {#if showMenu}
        <div class="dropdown">
          <button onclick={() => openAndClose(onOpenMemoryEditor)}>Memory</button>
          <button onclick={() => openAndClose(onOpenAuthorNoteEditor)}>Author's Note</button>
          <button onclick={() => openAndClose(onOpenModulesEditor)}>Story Modules</button>
          {#if $currentStoryId}
            <a href={api.stories.exportUrl($currentStoryId, "neuradventure")} download class="dropdown-link"
              >Export JSON</a
            >
            <a href={api.stories.exportUrl($currentStoryId, "tavern")} download class="dropdown-link">Export ST Chat</a>
            <a href={api.stories.exportUrl($currentStoryId, "plaintext")} download class="dropdown-link">Export Text</a>
          {/if}
        </div>
      {/if}
    </div>
  </div>
</header>

<style>
  /* ── Header ─────────────────────────────────────────── */
  header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0 0.5rem 0 0;
    border-bottom: 1px solid var(--border);
    min-height: 46px;
    flex-shrink: 0;
  }
  @media (min-width: 1200px) {
    header {
      padding: 0 1.5rem 0 0;
    }
  }
  .header-back {
    background: none;
    border: none;
    border-right: 1px solid var(--border);
    color: var(--text-dim);
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    width: 46px;
    min-height: 46px;
    flex-shrink: 0;
    transition:
      color 0.15s,
      background 0.15s;
  }
  .header-back:hover {
    color: var(--text);
    background: var(--bg-action);
  }
  .header-center {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.35rem 0;
  }
  .story-name {
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--text);
    font-weight: 500;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }
  .header-scene {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    color: var(--text-scene);
    letter-spacing: 0.06em;
    white-space: normal;
    overflow-wrap: anywhere;
    line-height: 1.2;
  }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 0.15rem;
    flex-shrink: 0;
  }
  .turn-badge {
    font-family: var(--font-ui);
    font-size: 0.7rem;
    color: var(--accent);
    background: var(--accent-dim);
    padding: 0.15rem 0.5rem;
    border-radius: var(--radius-pill);
    font-feature-settings: "tnum";
    font-weight: 500;
    letter-spacing: 0.02em;
    margin-right: 0.25rem;
  }
  .hbtn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    min-width: 34px;
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.15s;
  }
  .hbtn:hover {
    color: var(--text);
  }
  .hbtn.inactive {
    opacity: 0.45;
  }
  .menu-wrap {
    position: relative;
  }
  .dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
  }
  @media (min-width: 1200px) {
    .mobile-only {
      display: none;
    }
  }
  @media (max-width: 1199px) {
    .desktop-only {
      display: none;
    }
  }
</style>
