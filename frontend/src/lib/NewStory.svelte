<script lang="ts">
  import { api } from "../api/client.js"
  import { activeScreen, showError } from "../stores/ui.js"
  import {
    pendingCharacter,
    pendingStoryTitle,
    pendingStoryScenario,
    currentStoryId,
    currentStoryTitle,
    character,
    worldState,
    npcs,
    turns,
  } from "../stores/game.js"

  let submitting = false
  let generateDescription = ""
  let generating = false

  async function generate() {
    if (!generateDescription.trim() || !$pendingCharacter) return
    generating = true
    try {
      const result = await api.generate.story(
        generateDescription.trim(),
        $pendingCharacter.name,
        [...$pendingCharacter.personality_traits, ...$pendingCharacter.custom_traits]
      )
      pendingStoryTitle.set(result.title)
      pendingStoryScenario.set(result.opening_scenario)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      generating = false
    }
  }

  $: charData = $pendingCharacter

  async function startAdventure() {
    if (!$pendingStoryTitle.trim()) { showError("Title is required"); return }
    if (!$pendingStoryScenario.trim()) { showError("Opening scenario is required"); return }
    if (!charData) { showError("No character selected"); return }

    submitting = true
    try {
      const { id } = await api.stories.create({
        title: $pendingStoryTitle.trim(),
        opening_scenario: $pendingStoryScenario.trim(),
        character_data: charData,
      })
      const [detail, storyTurns] = await Promise.all([
        api.stories.get(id),
        api.turns.list(id),
      ])
      currentStoryId.set(id)
      currentStoryTitle.set(detail.title)
      character.set(detail.character)
      worldState.set(detail.world)
      npcs.set(detail.npcs)
      turns.set(storyTurns)
      pendingCharacter.set(null)
      pendingStoryTitle.set("")
      pendingStoryScenario.set("")
      activeScreen.set("game")
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create story")
    } finally {
      submitting = false
    }
  }
</script>

<div class="screen new-story">
  <header>
    <button class="back-btn" onclick={() => activeScreen.set("char-create")}>← Back</button>
    <h2>New Story</h2>
  </header>

  <div class="form-scroll" data-scroll-root="screen">
    <div class="field generate-field">
      <label for="story-generate">Generate from Description</label>
      <div class="generate-row">
        <textarea
          id="story-generate"
          bind:value={generateDescription}
          placeholder="e.g. a heist in a magical library full of forbidden knowledge"
          rows="2"
        ></textarea>
        <button
          class="btn-ghost generate-btn"
          onclick={generate}
          disabled={generating || !generateDescription.trim()}
        >{generating ? "Generating..." : "✦ Generate"}</button>
      </div>
    </div>

    <div class="field">
      <label for="story-title">Story Title</label>
      <input id="story-title" type="text" bind:value={$pendingStoryTitle} placeholder="Name your adventure..." />
    </div>

    <div class="field">
      <label for="story-scenario">Opening Scenario</label>
      <textarea
        id="story-scenario"
        bind:value={$pendingStoryScenario}
        placeholder="Describe the starting situation. Where is your character? What's happening?"
        rows="6"
      ></textarea>
    </div>

    {#if charData}
      <div class="char-summary">
        <div class="char-summary-header">Character</div>
        <div class="char-name">{charData.name}</div>
        <div class="char-details">
          {charData.gender} ·
          {[...charData.personality_traits, ...charData.custom_traits].join(", ") || "No traits"}
        </div>
        <button class="btn-ghost small" onclick={() => activeScreen.set("char-create")}>Change</button>
      </div>
    {/if}
  </div>

  <div class="actions">
    <button class="btn-accent full" onclick={startAdventure} disabled={submitting}>
      {submitting ? "Creating..." : "Start Adventure →"}
    </button>
  </div>
</div>

<style>
  .new-story {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    font-family: var(--font-ui);
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
  }
  .back-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 0.25rem;
    font-size: 0.9rem;
    min-height: 44px;
  }
  .back-btn:hover { color: var(--text); }
  .form-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  input[type="text"],
  textarea {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    padding: 0.75rem;
    font-size: 1rem;
    font-family: var(--font-ui);
    resize: none;
    width: 100%;
    box-sizing: border-box;
  }
  input[type="text"]:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .char-summary {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .char-summary-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .char-name {
    font-size: 1.1rem;
    font-family: var(--font-story);
    color: var(--text);
  }
  .char-details {
    font-size: 0.85rem;
    color: var(--text-dim);
  }
  .btn-ghost.small {
    font-size: 0.8rem;
    padding: 0.3rem 0.6rem;
    margin-top: 0.5rem;
    align-self: flex-start;
  }
  .actions {
    padding: 1rem;
    border-top: 1px solid var(--border);
  }
  .full { width: 100%; }
  .generate-field {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
  }
  .generate-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }
  .generate-row textarea { flex: 1; }
  .generate-btn {
    white-space: nowrap;
    align-self: stretch;
  }
</style>
