<script lang="ts">
  import { activeScreen, errorMessage } from "./stores/ui.js"
  import { theme, design } from "./stores/settings.js"
  import HomeScreen from "./lib/HomeScreen.svelte"
  import CharCreate from "./lib/CharCreate.svelte"
  import NewStory from "./lib/NewStory.svelte"
  import GameScreen from "./lib/GameScreen.svelte"
  import CharSheet from "./lib/CharSheet.svelte"
  import NPCTracker from "./lib/NPCTracker.svelte"
  import Settings from "./lib/Settings.svelte"
</script>

<div
  class="app"
  class:theme-amoled={$theme === "amoled"}
  class:design-roboto={$design === "roboto"}
>
  {#if $activeScreen === "home"}
    <HomeScreen />
  {:else if $activeScreen === "char-create"}
    <CharCreate />
  {:else if $activeScreen === "new-story"}
    <NewStory />
  {:else if $activeScreen === "game"}
    <GameScreen />
  {:else if $activeScreen === "settings"}
    <Settings />
  {/if}

  <CharSheet />
  <NPCTracker />

  {#if $errorMessage}
    <div class="toast">{$errorMessage}</div>
  {/if}
</div>

<style>
  :global(:root) {
    /* Colors */
    --bg:           #1c1c1c;
    --bg-raised:    #242424;
    --bg-input:     #161616;
    --bg-action:    rgba(255,255,255,0.035);
    --border:       rgba(255,255,255,0.07);
    --border-hover: rgba(255,255,255,0.15);

    --text:         #ffffff;
    --text-dim:     #aaa8a2;
    --text-action:  #d8d6d0;
    --text-scene:   #888680;

    --accent:       #c8a96e;
    --accent-dim:   rgba(200,169,110,0.18);
    --accent-hover: #ddbf85;
    --danger:       #b54040;

    /* Typography — classic default */
    --font-story: 'Spectral', Georgia, serif;
    --font-ui:    'DM Sans', system-ui, sans-serif;
    --font-brand: 'Cinzel', serif;

    /* Sizes */
    --story-size:  1.05rem;
    --story-line:  1.75;
    --ui-size:     0.875rem;
  }

  /* ── AMOLED theme ───────────────────────────────────── */
  :global(.theme-amoled) {
    --bg:           #000000;
    --bg-raised:    #0c0c0c;
    --bg-input:     #050505;
    --bg-action:    rgba(255,255,255,0.04);
    --border:       rgba(255,255,255,0.09);
    --border-hover: rgba(255,255,255,0.2);
  }

  /* ── Roboto design ──────────────────────────────────── */
  :global(.design-roboto) {
    --font-story: 'Roboto', sans-serif;
    --font-ui:    'Roboto', sans-serif;
    --font-brand: 'Roboto Condensed', sans-serif;
    --story-size:  0.975rem;
    --story-line:  1.65;
  }

  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    background: var(--bg);
    color: var(--text);
    font-family: var(--font-ui);
    height: 100dvh;
    overflow: hidden;
  }

  /* ── Global button primitives ─────────────────────── */
  :global(.btn-primary) {
    background: var(--accent);
    color: #0d0b08;
    border: none;
    padding: 0.65rem 1.25rem;
    cursor: pointer;
    font-weight: 600;
    font-size: var(--ui-size);
    font-family: var(--font-ui);
    letter-spacing: 0.03em;
    min-height: 44px;
    transition: background 0.15s;
  }
  :global(.btn-primary:hover:not(:disabled)) { background: var(--accent-hover); }
  :global(.btn-primary:disabled) { opacity: 0.4; cursor: not-allowed; }

  :global(.btn-ghost) {
    background: none;
    color: var(--text-dim);
    border: 1px solid var(--border);
    padding: 0.65rem 1.25rem;
    cursor: pointer;
    font-size: var(--ui-size);
    font-family: var(--font-ui);
    min-height: 44px;
    transition: color 0.15s, border-color 0.15s;
  }
  :global(.btn-ghost:hover) {
    color: var(--text);
    border-color: var(--border-hover);
  }

  :global(.btn-accent) {
    background: var(--accent);
    color: #0d0b08;
    border: none;
    padding: 0.65rem 1.25rem;
    cursor: pointer;
    font-weight: 600;
    font-size: var(--ui-size);
    font-family: var(--font-ui);
    letter-spacing: 0.03em;
    min-height: 44px;
    transition: background 0.15s;
  }
  :global(.btn-accent:hover:not(:disabled)) { background: var(--accent-hover); }
  :global(.btn-accent:disabled) { opacity: 0.4; cursor: not-allowed; }

  :global(.screen) {
    height: 100dvh;
    max-width: 680px;
    margin: 0 auto;
    display: flex;
    flex-direction: column;
  }

  .app {
    height: 100dvh;
    position: relative;
    background: var(--bg);
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
    from { opacity: 0; transform: translate(-50%, 8px); }
    to   { opacity: 1; transform: translate(-50%, 0); }
  }
</style>
