<script lang="ts">
  import { tick } from "svelte"
  import { api, type TurnSummary, ApiError } from "../api/client.js"
  import { activeScreen, showCharSheet, showNPCTracker, showError } from "../stores/ui.js"
  import {
    currentStoryId,
    currentStoryTitle,
    character,
    worldState,
    npcs,
    turns,
    isGenerating,
    resetGame,
  } from "../stores/game.js"

  type ActionMode = "do" | "say" | "story"
  const ACTION_MODES: ActionMode[] = ["do", "say", "story"]
  const MODE_LABELS: Record<ActionMode, string> = { do: "Do", say: "Say", story: "Story" }
  const MODE_HINTS: Record<ActionMode, string> = {
    do:    "What do you do?",
    say:   "What do you say?",
    story: "Write story text directly...",
  }

  let input = ""
  let actionMode: ActionMode = "do"
  let storyDiv: HTMLDivElement
  let showMenu = false

  function cycleMode(dir: 1 | -1) {
    const i = ACTION_MODES.indexOf(actionMode)
    actionMode = ACTION_MODES[(i + dir + ACTION_MODES.length) % ACTION_MODES.length]
  }

  async function sendTurn() {
    const text = input.trim()
    if (!text || $isGenerating || !$currentStoryId) return
    input = ""
    isGenerating.set(true)
    try {
      const result = await api.turns.take($currentStoryId, text, actionMode)
      character.set(result.character)
      worldState.set(result.world)
      npcs.set(result.npcs)
      const newTurn: TurnSummary = {
        id: result.turn_id,
        turn_number: result.turn_number,
        player_input: text,
        narrative_text: result.narrative_text,
        created_at: new Date().toISOString(),
      }
      turns.update((t) => [...t, newTurn])
      await tick()
      scrollToBottom()
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message)
      } else {
        showError("Generation failed. Is KoboldCpp running?")
      }
    } finally {
      isGenerating.set(false)
    }
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      sendTurn()
    }
  }

  function scrollToBottom() {
    if (storyDiv) storyDiv.scrollTop = storyDiv.scrollHeight
  }

  function goHome() {
    resetGame()
    activeScreen.set("home")
  }

  function downloadStory() {
    if (!$currentStoryId) return
    const a = document.createElement("a")
    a.href = api.stories.exportUrl($currentStoryId)
    a.download = `story-${$currentStoryId}.json`
    a.click()
    showMenu = false
  }

  // Split narrative into paragraphs for proper rendering
  function paragraphs(text: string): string[] {
    return text.split(/\n\n+/).map(p => p.trim()).filter(Boolean)
  }
</script>

<div class="screen game">

  <!-- ── Top bar ─────────────────────────────────────────── -->
  <header>
    <span class="flame" aria-hidden="true">🕯</span>
    <span class="story-name">{$currentStoryTitle}</span>
    <div class="spacer"></div>
    <span class="turn-count">{$turns.length}</span>
    <button class="hbtn" title="Character Sheet" onclick={() => showCharSheet.update(v => !v)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
      </svg>
    </button>
    <button class="hbtn" title="NPC Tracker" onclick={() => showNPCTracker.update(v => !v)}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
        <circle cx="9" cy="7" r="3"/><path d="M2 20c0-3 2.7-5.5 7-5.5"/>
        <circle cx="17" cy="9" r="2.5"/><path d="M14 20c0-2.5 1.8-4 4.5-4 2.7 0 4.5 1.5 4.5 4"/>
      </svg>
    </button>
    <div class="menu-wrap">
      <button class="hbtn" aria-label="More options" onclick={() => (showMenu = !showMenu)}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="12" cy="5" r="1.2"/><circle cx="12" cy="12" r="1.2"/><circle cx="12" cy="19" r="1.2"/>
        </svg>
      </button>
      {#if showMenu}
        <div class="dropdown">
          <button onclick={downloadStory}>Export JSON</button>
          <button onclick={goHome} class="danger-item">← Back to Stories</button>
        </div>
      {/if}
    </div>
  </header>

  <!-- ── Story scroll area ───────────────────────────────── -->
  <div class="story-area" bind:this={storyDiv}>
    <!-- Opening scene context -->
    {#if $worldState}
      <p class="scene-crumb">
        {$worldState.current_scene} · {$worldState.time_of_day}
      </p>
    {/if}

    {#if $turns.length === 0 && $worldState}
      <p class="opening-text">{$worldState.recent_events_summary}</p>
    {/if}

    {#each $turns as turn, i (turn.id)}
      <!-- Player action inline — matches AI Dungeon's "pencil" style -->
      <div class="action-inline" class:fresh={i === $turns.length - 1 && !$isGenerating}>
        <svg class="pencil-icon" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
        </svg>
        {turn.player_input}
      </div>

      <!-- Narrative paragraphs -->
      <div class="narrative-block" class:fresh={i === $turns.length - 1 && !$isGenerating}>
        {#each paragraphs(turn.narrative_text) as para, j}
          <p class="para" style="animation-delay: {j * 0.06}s">{para}</p>
        {/each}
      </div>
    {/each}

    {#if $isGenerating}
      <div class="thinking">
        <span class="dot"></span><span class="dot"></span><span class="dot"></span>
      </div>
    {/if}

    <!-- Breathing room at bottom -->
    <div style="height:1rem"></div>
  </div>

  <!-- ── Input zone ──────────────────────────────────────── -->
  <div class="input-zone">

    <!-- Mode selector row — AI Dungeon style -->
    <div class="mode-row">
      <button class="mode-clear" onclick={() => (input = "")} disabled={!input} aria-label="Clear">
        ×
      </button>

      <button class="mode-arrow" onclick={() => cycleMode(-1)} aria-label="Previous mode">‹</button>
      <span class="mode-label">{MODE_LABELS[actionMode]}</span>
      <button class="mode-arrow" onclick={() => cycleMode(1)} aria-label="Next mode">›</button>

      <button class="mode-regen" disabled title="Regenerate (coming soon)">↻</button>

      <button
        class="send-btn"
        onclick={sendTurn}
        disabled={$isGenerating || !input.trim()}
        aria-label="Send"
      >
        {#if $isGenerating}
          <svg class="spin" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
          </svg>
        {:else}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
            <line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>
          </svg>
        {/if}
      </button>
    </div>

    <!-- Text input -->
    <textarea
      bind:value={input}
      placeholder={MODE_HINTS[actionMode]}
      rows="2"
      disabled={$isGenerating}
      onkeydown={handleKeydown}
    ></textarea>

    <!-- Bottom toolbar -->
    <div class="toolbar">
      <button class="tbtn" onclick={goHome} title="Stories">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
          <polyline points="9 22 9 12 15 12 15 22"/>
        </svg>
      </button>
      <button class="tbtn" onclick={() => showCharSheet.update(v => !v)} title="Character">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
        </svg>
      </button>
      <button class="tbtn" onclick={() => showNPCTracker.update(v => !v)} title="NPCs">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <circle cx="9" cy="7" r="3"/><path d="M2 20c0-3 2.7-5.5 7-5.5"/>
          <circle cx="17" cy="9" r="2.5"/><path d="M14 20c0-2.5 1.8-4 4.5-4 2.7 0 4.5 1.5 4.5 4"/>
        </svg>
      </button>
      <button class="tbtn" onclick={downloadStory} title="Export">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </button>
    </div>
  </div>

</div>

<style>
  .game {
    position: relative;
    overflow: hidden;
  }

  /* ── Header ─────────────────────────────────────────── */
  header {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.6rem 1rem 0.6rem 0.85rem;
    border-bottom: 1px solid var(--border);
    min-height: 48px;
    flex-shrink: 0;
  }
  .flame {
    font-size: 1rem;
    flex-shrink: 0;
    opacity: 0.85;
  }
  .story-name {
    font-family: var(--font-ui);
    font-size: 0.82rem;
    color: var(--text-dim);
    font-weight: 400;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 160px;
    letter-spacing: 0.01em;
  }
  .spacer { flex: 1; }
  .turn-count {
    font-family: var(--font-ui);
    font-size: 0.8rem;
    color: var(--text-dim);
    min-width: 24px;
    text-align: right;
    font-feature-settings: "tnum";
  }
  .hbtn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    min-width: 36px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 4px;
    transition: color 0.15s;
  }
  .hbtn:hover { color: var(--text); }
  .menu-wrap { position: relative; }
  .dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
    background: var(--bg-raised);
    border: 1px solid var(--border);
    z-index: 50;
    min-width: 170px;
  }
  .dropdown button {
    display: block;
    width: 100%;
    padding: 0.7rem 1rem;
    background: none;
    border: none;
    text-align: left;
    cursor: pointer;
    color: var(--text);
    font-size: 0.85rem;
    font-family: var(--font-ui);
  }
  .dropdown button:hover { background: var(--bg-action); }
  .dropdown .danger-item { color: var(--text-dim); }

  /* ── Story area ─────────────────────────────────────── */
  .story-area {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 1.25rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  .scene-crumb {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-scene);
    text-transform: uppercase;
    letter-spacing: 0.1em;
    margin-bottom: 1.25rem;
  }
  .opening-text {
    font-family: var(--font-story);
    font-size: var(--story-size);
    line-height: var(--story-line);
    color: var(--text);
    margin-bottom: 1.5rem;
    font-style: italic;
    opacity: 0.75;
  }

  /* Player action — pencil style */
  .action-inline {
    display: flex;
    align-items: baseline;
    gap: 0.5rem;
    background: var(--bg-action);
    padding: 0.55rem 1rem 0.55rem 0.85rem;
    margin: 1rem -1.25rem;
    color: var(--text-action);
    font-family: var(--font-story);
    font-size: 0.92rem;
    font-style: italic;
    line-height: 1.5;
  }
  .pencil-icon {
    flex-shrink: 0;
    color: var(--text-dim);
    opacity: 0.6;
    position: relative;
    top: 1px;
  }

  /* Narrative paragraphs */
  .narrative-block {
    margin-bottom: 1rem;
  }
  .para {
    font-family: var(--font-story);
    font-size: var(--story-size);
    line-height: var(--story-line);
    color: var(--text);
    margin-bottom: 1em;
  }
  .para:last-child { margin-bottom: 0; }

  /* Fade-in animation for fresh turns */
  .fresh .para {
    animation: paraIn 0.4s ease both;
  }
  .fresh.action-inline {
    animation: paraIn 0.25s ease both;
  }
  @keyframes paraIn {
    from { opacity: 0; transform: translateY(5px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  /* Thinking dots */
  .thinking {
    display: flex;
    gap: 5px;
    align-items: center;
    padding: 0.75rem 0 0.5rem;
  }
  .dot {
    width: 6px; height: 6px;
    background: var(--accent);
    border-radius: 50%;
    opacity: 0.5;
    animation: blink 1.2s infinite ease-in-out;
  }
  .dot:nth-child(2) { animation-delay: 0.2s; }
  .dot:nth-child(3) { animation-delay: 0.4s; }
  @keyframes blink {
    0%, 80%, 100% { opacity: 0.2; transform: scale(0.75); }
    40%           { opacity: 0.9; transform: scale(1); }
  }

  /* ── Input zone ─────────────────────────────────────── */
  .input-zone {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }

  /* Mode selector row */
  .mode-row {
    display: flex;
    align-items: center;
    gap: 0;
    padding: 0.35rem 0.75rem;
    border-bottom: 1px solid var(--border);
    min-height: 42px;
  }
  .mode-clear {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 1.1rem;
    min-width: 34px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.15s, color 0.15s;
    pointer-events: none;
  }
  .mode-clear:not(:disabled) {
    opacity: 1;
    pointer-events: auto;
  }
  .mode-clear:hover { color: var(--text); }
  .mode-arrow {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 1.2rem;
    min-width: 32px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 0.15s;
  }
  .mode-arrow:hover { color: var(--accent); }
  .mode-label {
    font-family: var(--font-ui);
    font-size: 0.82rem;
    font-weight: 500;
    color: var(--accent);
    min-width: 42px;
    text-align: center;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .mode-regen {
    background: none;
    border: none;
    color: var(--text-dim);
    font-size: 0.95rem;
    min-width: 32px;
    min-height: 36px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: not-allowed;
    opacity: 0.3;
    margin-left: 0.15rem;
  }
  .send-btn {
    margin-left: auto;
    background: var(--accent);
    border: none;
    color: #0d0b08;
    border-radius: 50%;
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
    flex-shrink: 0;
  }
  .send-btn:hover:not(:disabled) { background: var(--accent-hover); }
  .send-btn:disabled { opacity: 0.35; cursor: not-allowed; }
  .spin {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Textarea */
  .input-zone textarea {
    width: 100%;
    background: transparent;
    border: none;
    color: var(--text);
    font-family: var(--font-story);
    font-size: 0.95rem;
    line-height: 1.5;
    padding: 0.65rem 1.25rem 0.5rem;
    resize: none;
    display: block;
  }
  .input-zone textarea::placeholder {
    color: var(--text-dim);
    font-style: italic;
  }
  .input-zone textarea:focus {
    outline: none;
  }
  .input-zone textarea:disabled {
    opacity: 0.4;
  }

  /* Bottom toolbar */
  .toolbar {
    display: flex;
    align-items: center;
    justify-content: space-around;
    padding: 0.2rem 0.5rem 0.5rem;
    border-top: 1px solid var(--border);
  }
  .tbtn {
    background: none;
    border: none;
    color: var(--text-dim);
    min-width: 48px;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: color 0.15s;
    border-radius: 4px;
  }
  .tbtn:hover { color: var(--text); }
</style>
