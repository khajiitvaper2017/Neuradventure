<script lang="ts">
  import type { TurnSummary, TurnVariantSummary } from "@/shared/types"
  import IconPencilSquare from "@/components/icons/IconPencilSquare.svelte"
  import IconTrash from "@/components/icons/IconTrash.svelte"
  import BackgroundEventsReveal from "@/components/rich/BackgroundEventsReveal.svelte"
  import RichText from "@/components/rich/RichText.svelte"
  import StreamingTurnPreview from "@/components/rich/StreamingTurnPreview.svelte"
  import ThinkingDots from "@/components/controls/ThinkingDots.svelte"
  import { autoresize } from "@/utils/actions/autoresize"
  import { looksLikeBlockHtml } from "@/utils/sanitizeHtml"
  import { currentStoryInitialWorld, currentStoryOpeningScenario, turns, worldState, isGenerating } from "@/stores/game"
  import { streamingEnabled } from "@/stores/settings"

  export let storyDiv: HTMLDivElement | null = null
  export let initialScrollDone = false

  export let flashScene = false
  export let flashOpening = false

  export let editingOpening = false
  export let openingDraft = ""
  export let startEditOpening: (() => void) | undefined = undefined
  export let cancelEditOpening: (() => void) | undefined = undefined
  export let saveOpening: (() => void) | undefined = undefined

  export let editingTurnId: number | null = null
  export let editPlayerInput = ""
  export let editNarrative = ""
  export let startEditTurn: ((turn: TurnSummary) => void) | undefined = undefined
  export let cancelEditTurn: (() => void) | undefined = undefined
  export let saveTurnEdit: ((turnId: number) => void) | undefined = undefined
  export let deleteTurn: ((turnId: number) => void) | undefined = undefined

  export let userActed = false
  export let regeneratingTurnId: number | null = null

  export let lastTurnVariants: TurnVariantSummary[] = []
  export let activeVariantId: number | null = null
  export let selectVariant: ((variantId: number) => void) | undefined = undefined

  export let handleStoryScroll: (() => void) | undefined = undefined

  export let streamNarrative = ""
  export let streamBackground = ""
  export let streamScene = ""
  export let streamTime = ""

  function paragraphs(text: string): string[] {
    let normalized = text.replace(/\r\n/g, "\n")
    if (!normalized.includes("\n") && normalized.includes("\\n")) {
      normalized = normalized.replace(/\\n/g, "\n")
    }
    const hasBlankLines = /\n\s*\n/.test(normalized)
    return normalized
      .split(hasBlankLines ? /\n\s*\n+/ : /\n+/)
      .map((p) => p.trim())
      .filter(Boolean)
  }
</script>

<div
  class="story-area"
  class:story-ready={initialScrollDone || $turns.length === 0}
  data-scroll-root="screen"
  bind:this={storyDiv}
  onscroll={handleStoryScroll}
>
  {#if $worldState}
    <p class="scene-crumb mobile-only" class:flash={flashScene}>
      {$worldState.current_scene} · {$worldState.time_of_day}
    </p>
  {/if}

  <div class="opening-block">
    <div class="opening-header">
      <span>Opening</span>
      {#if !editingOpening}
        <button
          class="edit-btn"
          onclick={startEditOpening}
          disabled={$isGenerating}
          title="Edit opening"
          aria-label="Edit opening"
        >
          <IconPencilSquare size={12} strokeWidth={2} />
        </button>
      {/if}
    </div>
    {#if $currentStoryInitialWorld}
      <p class="opening-scene">{$currentStoryInitialWorld.current_scene} · {$currentStoryInitialWorld.time_of_day}</p>
    {/if}
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
      <div class="opening-text" class:flash={flashOpening}>
        <RichText text={$currentStoryOpeningScenario || $worldState?.memory || ""} mode="block" />
      </div>
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
          <button class="btn-accent" onclick={() => saveTurnEdit?.(turn.id)} disabled={$isGenerating}>Save</button>
        </div>
      </div>
    {:else}
      <div class="action-inline" class:fresh={userActed && i === $turns.length - 1 && !$isGenerating}>
        {#if turn.player_input.trim().length > 0}
          <IconPencilSquare className="pencil-icon" size={12} strokeWidth={2} />
        {/if}
        <span class="action-text">
          <RichText text={turn.player_input} mode="inline" />
        </span>
        <button
          class="edit-btn inline"
          onclick={() => startEditTurn?.(turn)}
          disabled={$isGenerating}
          title="Edit turn"
          aria-label="Edit turn"
        >
          <IconPencilSquare size={12} strokeWidth={2} />
        </button>
        <button
          class="delete-btn inline"
          onclick={() => deleteTurn?.(turn.id)}
          disabled={$isGenerating}
          title="Delete turn"
        >
          <IconTrash size={12} strokeWidth={2} />
        </button>
      </div>

      <div class="narrative-block" class:fresh={userActed && i === $turns.length - 1 && !$isGenerating}>
        {#if $isGenerating && regeneratingTurnId === turn.id}
          <p class="regen-placeholder">Regenerating…</p>
        {:else}
          {#if turn.world}
            <p class="turn-scene">{turn.world.current_scene} · {turn.world.time_of_day}</p>
          {/if}

          <BackgroundEventsReveal text={turn.background_events} />

          {#if looksLikeBlockHtml(turn.narrative_text)}
            <div class="para para--html" style="animation-delay: 0s">
              <RichText text={turn.narrative_text} mode="block" />
            </div>
          {:else}
            {#each paragraphs(turn.narrative_text) as para, j}
              <p class="para" style="animation-delay: {j * 0.06}s">
                <RichText text={para} mode="inline" />
              </p>
            {/each}
          {/if}

          {#if i === $turns.length - 1 && lastTurnVariants.length > 1}
            <div class="variant-row">
              <span class="variant-label">Versions</span>
              {#each lastTurnVariants as variant (variant.id)}
                <button
                  class="variant-pill {activeVariantId === variant.id ? 'active' : ''}"
                  onclick={() => selectVariant?.(variant.id)}
                  disabled={$isGenerating}
                  title={`Version ${variant.variant_index}`}
                >
                  {variant.variant_index}
                </button>
              {/each}
            </div>
          {/if}
        {/if}
      </div>
    {/if}
  {/each}

  {#if $isGenerating && $streamingEnabled}
    <StreamingTurnPreview
      narrativeText={streamNarrative}
      backgroundEvents={streamBackground}
      currentScene={streamScene}
      timeOfDay={streamTime}
    />
  {/if}

  {#if $isGenerating}
    <ThinkingDots />
  {/if}

  <div style="height:1rem"></div>
</div>

<style>
  /* ── Story area ─────────────────────────────────────── */
  .story-area {
    flex: 1;
    overflow-y: auto;
    padding: 1.5rem 1.25rem 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0;
    visibility: hidden;
  }
  .story-area.story-ready {
    visibility: visible;
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
    letter-spacing: 0.1em;
    color: var(--text-dim);
  }
  .opening-scene {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    color: var(--text-scene);
    letter-spacing: 0.08em;
  }
  .scene-crumb {
    font-family: var(--font-ui);
    font-size: 0.72rem;
    color: var(--text-scene);
    letter-spacing: 0.1em;
    margin-bottom: 1.25rem;
  }
  .turn-scene {
    font-family: var(--font-ui);
    font-size: 0.65rem;
    color: var(--text-scene);
    letter-spacing: 0.08em;
    margin-bottom: 0.4rem;
  }
  .opening-text {
    font-family: var(--font-story);
    font-size: var(--story-size);
    line-height: var(--story-line);
    color: var(--text);
    margin-bottom: 1.5rem;
    font-style: italic;
    opacity: 0.75;
    white-space: pre-line;
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
  .edit-btn {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    padding: 0.25rem 0.6rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    min-height: 28px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .edit-btn:hover {
    color: var(--text);
  }
  .edit-btn.inline {
    margin-left: auto;
  }
  .delete-btn {
    background: none;
    border: 1px solid var(--accent);
    color: var(--accent);
    padding: 0.25rem 0.5rem;
    border-radius: 4px;
    cursor: pointer;
    font-size: 0.75rem;
    min-height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .delete-btn:hover:not(:disabled) {
    background: var(--accent);
    color: #0d0b08;
  }
  .delete-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .delete-btn.inline {
    margin-left: 0.25rem;
  }

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
  :global(.pencil-icon) {
    flex-shrink: 0;
    color: var(--text-dim);
    opacity: 0.6;
    position: relative;
    top: 1px;
  }

  .narrative-block {
    margin-bottom: 1rem;
  }
  .para {
    font-family: var(--font-story);
    font-size: var(--story-size);
    line-height: var(--story-line);
    color: var(--text);
    margin-bottom: 1em;
    white-space: pre-line;
  }
  .para:last-child {
    margin-bottom: 0;
  }
  .action-text {
    flex: 1;
    min-width: 0;
  }
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
</style>
