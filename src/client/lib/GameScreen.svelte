<script lang="ts">
  import { tick } from "svelte"
  import { api, type TurnSummary, ApiError } from "../api/client.js"
  import { activeScreen, showCharSheet, showNPCTracker, showError } from "../stores/ui.js"
  import { autoresize } from "./actions/autoresize.js"
  import {
    currentStoryId,
    currentStoryTitle,
    currentStoryOpeningScenario,
    character,
    worldState,
    npcs,
    turns,
    isGenerating,
    resetGame,
  } from "../stores/game.js"

  type ActionMode = "do" | "say" | "story"
  const ACTION_MODES: ActionMode[] = ["do", "say", "story"]
  const MODE_HINTS: Record<ActionMode, string> = {
    do: "What do you do?",
    say: "What do you say?",
    story: "Write story text directly...",
  }

  let input = ""
  let actionMode: ActionMode = "do"
  let storyDiv: HTMLDivElement
  let showMenu = false
  let editingOpening = false
  let openingDraft = ""
  let editingTurnId: number | null = null
  let editPlayerInput = ""
  let editNarrative = ""

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

  function startEditOpening() {
    openingDraft = $currentStoryOpeningScenario || $worldState?.recent_events_summary || ""
    editingOpening = true
  }

  function cancelEditOpening() {
    editingOpening = false
  }

  async function saveOpening() {
    if (!$currentStoryId) return
    const text = openingDraft.trim()
    if (!text) {
      showError("Opening scenario cannot be empty")
      return
    }
    try {
      await api.stories.update($currentStoryId, { opening_scenario: text })
      currentStoryOpeningScenario.set(text)
      editingOpening = false
    } catch {
      showError("Failed to update opening scenario")
    }
  }

  function startEditTurn(turn: TurnSummary) {
    editingTurnId = turn.id
    editPlayerInput = turn.player_input
    editNarrative = turn.narrative_text
  }

  function cancelEditTurn() {
    editingTurnId = null
  }

  async function saveTurnEdit(turnId: number) {
    const playerInput = editPlayerInput.trim()
    const narrative = editNarrative.trim()
    if (!playerInput || !narrative) {
      showError("Player input and narrative text are required")
      return
    }
    try {
      await api.turns.update(turnId, { player_input: playerInput, narrative_text: narrative })
      turns.update((t) =>
        t.map((turn) =>
          turn.id === turnId ? { ...turn, player_input: playerInput, narrative_text: narrative } : turn,
        ),
      )
      editingTurnId = null
    } catch {
      showError("Failed to update turn")
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
    return text
      .split(/\n\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
  }

</script>

<div class="screen game">
  <!-- ── Top bar ─────────────────────────────────────────── -->
  <header>
    <button class="hbtn desktop-only home-btn" onclick={goHome} title="Return to menu">← Menu</button>
    <span class="app-name desktop-only">Neuradventure</span>
    <span class="header-sep desktop-only">•</span>
    <span class="flame" aria-hidden="true">🕯</span>
    <span class="story-name">{$currentStoryTitle}</span>
    <div class="spacer"></div>
    <span class="turn-count">{$turns.length}</span>
    <button class="hbtn mobile-only" title="Character Sheet" onclick={() => showCharSheet.update((v) => !v)}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      >
        <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
      </svg>
    </button>
    <button class="hbtn mobile-only" title="NPC Tracker" onclick={() => showNPCTracker.update((v) => !v)}>
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        stroke-linecap="round"
      >
        <circle cx="9" cy="7" r="3" /><path d="M2 20c0-3 2.7-5.5 7-5.5" />
        <circle cx="17" cy="9" r="2.5" /><path d="M14 20c0-2.5 1.8-4 4.5-4 2.7 0 4.5 1.5 4.5 4" />
      </svg>
    </button>
    <div class="menu-wrap">
      <button class="hbtn" aria-label="More options" onclick={() => (showMenu = !showMenu)}>
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <circle cx="12" cy="5" r="1.2" /><circle cx="12" cy="12" r="1.2" /><circle cx="12" cy="19" r="1.2" />
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
  <div class="story-area" data-scroll-root="screen" bind:this={storyDiv}>
    <!-- Opening scene context -->
    {#if $worldState}
      <p class="scene-crumb">
        {$worldState.current_scene} · {$worldState.time_of_day}
      </p>
    {/if}

    <div class="opening-block">
      <div class="opening-header">
        <span>Opening</span>
        {#if !editingOpening}
          <button class="edit-btn" onclick={startEditOpening} disabled={$isGenerating}>Edit</button>
        {/if}
      </div>
      {#if editingOpening}
        <textarea
          class="edit-textarea"
          bind:value={openingDraft}
          rows="6"
          disabled={$isGenerating}
          use:autoresize={openingDraft}
        ></textarea>
        <div class="edit-actions">
          <button class="btn-ghost" onclick={cancelEditOpening} disabled={$isGenerating}>Cancel</button>
          <button class="btn-accent" onclick={saveOpening} disabled={$isGenerating}>Save</button>
        </div>
      {:else}
        <p class="opening-text">{$currentStoryOpeningScenario || $worldState?.recent_events_summary || ""}</p>
      {/if}
    </div>

    {#each $turns as turn, i (turn.id)}
      {#if editingTurnId === turn.id}
        <div class="edit-turn">
          <label class="edit-label" for="edit-player-input">Player Input</label>
          <textarea
            id="edit-player-input"
            class="edit-textarea"
            bind:value={editPlayerInput}
            rows="2"
            disabled={$isGenerating}
            use:autoresize={editPlayerInput}
          ></textarea>
          <label class="edit-label" for="edit-narrative">Story Text</label>
          <textarea
            id="edit-narrative"
            class="edit-textarea"
            bind:value={editNarrative}
            rows="6"
            disabled={$isGenerating}
            use:autoresize={editNarrative}
          ></textarea>
          <div class="edit-actions">
            <button class="btn-ghost" onclick={cancelEditTurn} disabled={$isGenerating}>Cancel</button>
            <button class="btn-accent" onclick={() => saveTurnEdit(turn.id)} disabled={$isGenerating}>Save</button>
          </div>
        </div>
      {:else}
        <!-- Player action inline — matches AI Dungeon's "pencil" style -->
        <div class="action-inline" class:fresh={i === $turns.length - 1 && !$isGenerating}>
          <svg
            class="pencil-icon"
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            stroke-linecap="round"
          >
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
          </svg>
          {turn.player_input}
          <button class="edit-btn inline" onclick={() => startEditTurn(turn)} disabled={$isGenerating}>Edit</button>
        </div>

        <!-- Narrative paragraphs -->
        <div class="narrative-block" class:fresh={i === $turns.length - 1 && !$isGenerating}>
          {#each paragraphs(turn.narrative_text) as para, j}
            <p class="para" style="animation-delay: {j * 0.06}s">{para}</p>
          {/each}
        </div>
      {/if}
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
      <button class="mode-clear" onclick={() => (input = "")} disabled={!input} aria-label="Clear"> × </button>

      <div class="mode-group" role="group" aria-label="Action mode">
        {#each ACTION_MODES as mode}
          <button class="mode-pill {actionMode === mode ? 'active' : ''}" onclick={() => (actionMode = mode)}
            >{mode}</button
          >
        {/each}
      </div>

      <button class="mode-regen" disabled title="Regenerate (coming soon)">↻</button>

      <button class="send-btn" onclick={sendTurn} disabled={$isGenerating || !input.trim()} aria-label="Send">
        {#if $isGenerating}
          <svg
            class="spin"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          >
            <path d="M21 12a9 9 0 1 1-6.219-8.56" />
          </svg>
        {:else}
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            stroke-width="2.2"
            stroke-linecap="round"
          >
            <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
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
      use:autoresize={input}
    ></textarea>

    <!-- Bottom toolbar -->
    <div class="toolbar">
      <button class="tbtn" onclick={goHome} title="Stories">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
          <polyline points="9 22 9 12 15 12 15 22" />
        </svg>
      </button>
      <button class="tbtn" onclick={() => showCharSheet.update((v) => !v)} title="Character">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" />
        </svg>
      </button>
      <button class="tbtn" onclick={() => showNPCTracker.update((v) => !v)} title="NPCs">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <circle cx="9" cy="7" r="3" /><path d="M2 20c0-3 2.7-5.5 7-5.5" />
          <circle cx="17" cy="9" r="2.5" /><path d="M14 20c0-2.5 1.8-4 4.5-4 2.7 0 4.5 1.5 4.5 4" />
        </svg>
      </button>
      <button class="tbtn" onclick={downloadStory} title="Export">
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          stroke-width="1.8"
          stroke-linecap="round"
        >
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
          <polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
        </svg>
      </button>
    </div>
  </div>
</div>

<style>
  .game {
    position: relative;
    overflow: hidden;
    max-width: none;
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
  @media (min-width: 1200px) {
    header {
      padding: 0.75rem 2.5rem;
    }
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
    max-width: 300px;
    letter-spacing: 0.01em;
  }
  .spacer {
    flex: 1;
  }
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
  .hbtn:hover {
    color: var(--text);
  }
  .menu-wrap {
    position: relative;
  }
  .dropdown {
    position: absolute;
    right: 0;
    top: calc(100% + 4px);
  }
  .desktop-only {
    display: none;
  }
  @media (min-width: 1200px) {
    .mobile-only {
      display: none;
    }
    .desktop-only {
      display: inline-flex;
      align-items: center;
    }
    .app-name {
      font-family: var(--font-brand);
      font-size: 0.72rem;
      letter-spacing: 0.16em;
      text-transform: uppercase;
      color: var(--accent);
      margin-right: 0.2rem;
    }
    .header-sep {
      color: var(--border);
      font-size: 0.8rem;
      margin: 0 0.4rem 0 0.1rem;
    }
    .home-btn {
      min-width: auto;
      min-height: 28px;
      padding: 0.25rem 0.6rem;
      border: 1px solid var(--border);
      border-radius: 4px;
      font-size: 0.72rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--text-dim);
    }
    .home-btn:hover {
      color: var(--text);
      border-color: var(--border-hover);
    }
  }

  /* ── Story area ─────────────────────────────────────── */
  .story-area {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 1.25rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
  }
  @media (min-width: 1200px) {
    .story-area {
      padding: 2rem 2.5rem 0.5rem;
    }
  }
  .opening-block {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    margin-bottom: 1.25rem;
  }
  .opening-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-dim);
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
  .edit-turn {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.9rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    margin-bottom: 1.25rem;
  }
  .edit-label {
    font-size: 0.72rem;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }
  .edit-textarea {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    padding: 0.75rem;
    font-size: 0.95rem;
    font-family: var(--font-ui);
    resize: none;
    overflow: hidden;
    width: 100%;
    box-sizing: border-box;
  }
  .edit-textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .edit-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }
  .edit-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    min-height: 28px;
  }
  .edit-btn:hover {
    color: var(--text);
  }
  .edit-btn.inline {
    margin-left: auto;
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
  @media (min-width: 1200px) {
    .action-inline {
      margin-left: -2.5rem;
      margin-right: -2.5rem;
      padding-left: 2.5rem;
      padding-right: 2.5rem;
    }
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
  .para:last-child {
    margin-bottom: 0;
  }

  /* Fade-in animation for fresh turns */
  .fresh .para {
    animation: paraIn 0.4s ease both;
  }
  .fresh.action-inline {
    animation: paraIn 0.25s ease both;
  }
  @keyframes paraIn {
    from {
      opacity: 0;
      transform: translateY(5px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  /* Thinking dots */
  .thinking {
    display: flex;
    gap: 5px;
    align-items: center;
    padding: 0.75rem 0 0.5rem;
  }
  .dot {
    width: 6px;
    height: 6px;
    background: var(--accent);
    border-radius: 50%;
    opacity: 0.5;
    animation: blink 1.2s infinite ease-in-out;
  }
  .dot:nth-child(2) {
    animation-delay: 0.2s;
  }
  .dot:nth-child(3) {
    animation-delay: 0.4s;
  }
  @keyframes blink {
    0%,
    80%,
    100% {
      opacity: 0.2;
      transform: scale(0.75);
    }
    40% {
      opacity: 0.9;
      transform: scale(1);
    }
  }

  /* ── Input zone ─────────────────────────────────────── */
  .input-zone {
    flex-shrink: 0;
    border-top: 1px solid var(--border);
    background: var(--bg);
  }
  @media (min-width: 1200px) {
    .input-zone {
      padding-left: 1.25rem;
      padding-right: 1.25rem;
      padding-bottom: 1.1rem;
    }
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
    transition:
      opacity 0.15s,
      color 0.15s;
    pointer-events: none;
  }
  .mode-clear:not(:disabled) {
    opacity: 1;
    pointer-events: auto;
  }
  .mode-clear:hover {
    color: var(--text);
  }
  .mode-group {
    display: flex;
    gap: 0.35rem;
    padding: 0.15rem 0.2rem;
    border: 1px solid var(--border);
    border-radius: 999px;
    background: var(--bg-action);
  }
  .mode-pill {
    border: none;
    background: none;
    color: var(--text-dim);
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.12em;
    padding: 0.3rem 0.65rem;
    border-radius: 999px;
    cursor: pointer;
    min-height: 28px;
  }
  .mode-pill:hover {
    color: var(--text);
  }
  .mode-pill.active {
    background: var(--accent);
    color: #0d0b08;
  }
  .mode-regen {
    background: var(--bg-action);
    border: 1px solid var(--border);
    color: var(--text-dim);
    font-size: 1rem;
    min-width: 34px;
    min-height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: not-allowed;
    opacity: 0.6;
    margin-left: 0.35rem;
    border-radius: 50%;
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
    transition:
      background 0.15s,
      opacity 0.15s;
    flex-shrink: 0;
  }
  .send-btn:hover:not(:disabled) {
    background: var(--accent-hover);
  }
  .send-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
  .spin {
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin {
    to {
      transform: rotate(360deg);
    }
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
    padding: 0.85rem 1.25rem 0.65rem;
    resize: none;
    display: block;
  }
  @media (min-width: 1200px) {
    .input-zone textarea {
      padding-bottom: 1.25rem;
      min-height: 68px;
    }
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
  @media (min-width: 1200px) {
    .toolbar {
      display: none;
    }
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
  .tbtn:hover {
    color: var(--text);
  }
</style>
