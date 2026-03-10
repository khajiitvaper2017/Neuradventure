<script lang="ts">
  import { onMount } from "svelte"
  import { api, type StoryCharacterGroup } from "../api/client.js"
  import { navigate, showError } from "../stores/ui.js"
  import { autoresize } from "./actions/autoresize.js"
  import {
    pendingCharacter,
    pendingStoryTitle,
    pendingStoryScenario,
    pendingStoryNPCs,
    pendingStoryLocation,
    pendingStoryGenerateDescription,
    currentStoryId,
    currentStoryTitle,
    currentStoryOpeningScenario,
    character,
    worldState,
    npcs,
    turns,
  } from "../stores/game.js"

  let submitting = false
  let generating = false
  let savedCharacters: StoryCharacterGroup[] = []
  let loadingCharacters = false
  let selectedCharacterKey: string | "" = ""
  let showCharacterDropdown = false

  onMount(loadCharacters)

  async function loadCharacters() {
    loadingCharacters = true
    try {
      savedCharacters = await api.stories.characters()
    } catch {
      showError("Failed to load characters")
    } finally {
      loadingCharacters = false
    }
  }

  function toggleCharacterDropdown() {
    if (loadingCharacters || savedCharacters.length === 0) return
    showCharacterDropdown = !showCharacterDropdown
  }

  function selectCharacter(key: string) {
    selectedCharacterKey = key
    const match = savedCharacters.find((c) => c.key === key)
    if (match) pendingCharacter.set(match.character)
    showCharacterDropdown = false
  }

  $: selectedCharacterLabel =
    savedCharacters.find((c) => c.key === selectedCharacterKey)?.character.name ?? "Select a character"

  async function generate() {
    if (!$pendingStoryGenerateDescription.trim() || !$pendingCharacter) return
    generating = true
    try {
      const result = await api.generate.story($pendingStoryGenerateDescription.trim(), $pendingCharacter.name, [
        ...$pendingCharacter.personality_traits,
        ...$pendingCharacter.custom_traits,
      ])
      pendingStoryTitle.set(result.title)
      pendingStoryScenario.set(result.opening_scenario)
      pendingStoryLocation.set(result.starting_location)
      pendingStoryNPCs.set(result.pregen_npcs ?? [])
    } catch (err) {
      showError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      generating = false
    }
  }

  $: charData = $pendingCharacter

  async function startAdventure() {
    if (!$pendingStoryTitle.trim()) {
      showError("Title is required")
      return
    }
    if (!$pendingStoryScenario.trim()) {
      showError("Opening scenario is required")
      return
    }
    if (!charData) {
      showError("No character selected")
      return
    }

    submitting = true
    try {
      const { id } = await api.stories.create({
        title: $pendingStoryTitle.trim(),
        opening_scenario: $pendingStoryScenario.trim(),
        starting_scene: $pendingStoryLocation.trim() || undefined,
        character_data: charData,
        npcs: $pendingStoryNPCs,
      })
      const [detail, storyTurns] = await Promise.all([api.stories.get(id), api.turns.list(id)])
      currentStoryId.set(id)
      currentStoryTitle.set(detail.title)
      currentStoryOpeningScenario.set(detail.opening_scenario)
      character.set(detail.character)
      worldState.set(detail.world)
      npcs.set(detail.npcs)
      turns.set(storyTurns)
      pendingCharacter.set(null)
      pendingStoryTitle.set("")
      pendingStoryScenario.set("")
      pendingStoryNPCs.set([])
      pendingStoryLocation.set("")
      pendingStoryGenerateDescription.set("")
      navigate("game", { reset: true })
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to create story")
    } finally {
      submitting = false
    }
  }
</script>

<svelte:window on:click={() => (showCharacterDropdown = false)} />

<div class="screen new-story">
  <header class="screen-header">
    <button class="back-btn" onclick={() => navigate("home")}>← Back</button>
    <h2 class="screen-title">New Story</h2>
  </header>

  <div class="form-scroll" data-scroll-root="screen">
    <div class="field generate-field">
      <label for="story-generate">Generate from Description</label>
      <div class="generate-row">
        <textarea
          id="story-generate"
          bind:value={$pendingStoryGenerateDescription}
          placeholder="e.g. a heist in a magical library full of forbidden knowledge"
          rows="2"
          use:autoresize={$pendingStoryGenerateDescription}
        ></textarea>
        <button
          class="btn-ghost generate-btn"
          onclick={generate}
          disabled={generating || !$pendingStoryGenerateDescription.trim()}
          >{generating ? "Generating..." : "✦ Generate"}</button
        >
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
        use:autoresize={$pendingStoryScenario}
      ></textarea>
    </div>

    <div class="field">
      <label for="story-location">Starting Location</label>
      <input
        id="story-location"
        type="text"
        bind:value={$pendingStoryLocation}
        placeholder="e.g. The lower decks of the airship"
      />
    </div>

    {#if $pendingStoryNPCs.length > 0}
      <div class="npc-summary">
        <div class="npc-summary-header">Pre-generated Characters</div>
        <div class="npc-list">
          {#each $pendingStoryNPCs as npc}
            <div class="npc-card">
              <div class="npc-name">{npc.name}</div>
              <div class="npc-details">
                {npc.race} · {npc.relationship_to_player || "Unknown"} · {npc.last_known_location || "Unknown"}
              </div>
              <div class="npc-traits">{npc.personality_traits.join(", ") || "No traits"}</div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="field">
      <label for="saved-character">Use Character From Stories</label>
      <div class="saved-row">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="saved-select-wrap" onclick={(e) => e.stopPropagation()}>
          <button
            id="saved-character"
            class="saved-select-btn"
            onclick={toggleCharacterDropdown}
            disabled={loadingCharacters || savedCharacters.length === 0}
            aria-haspopup="listbox"
            aria-expanded={showCharacterDropdown}
          >
            <span
              >{loadingCharacters
                ? "Loading characters..."
                : savedCharacters.length === 0
                  ? "No characters yet"
                  : selectedCharacterLabel}</span
            >
            <span class="saved-caret"></span>
          </button>
          {#if showCharacterDropdown}
            <div class="saved-select-menu" role="listbox">
              {#each savedCharacters as c}
                <button class="saved-select-item" role="option" aria-selected={selectedCharacterKey === c.key} onclick={() => selectCharacter(c.key)}>
                  {c.character.name}
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button class="btn-ghost" onclick={() => navigate("char-create")}> New </button>
        <button class="btn-ghost" onclick={loadCharacters} disabled={loadingCharacters}> Refresh </button>
      </div>
    </div>

    {#if charData}
      <div class="char-summary">
        <div class="char-summary-header">Character</div>
        <div class="char-name">{charData.name}</div>
        <div class="char-details">
          {charData.gender} ·
          {[...charData.personality_traits, ...charData.custom_traits].join(", ") || "No traits"}
        </div>
        <button class="btn-ghost small" onclick={() => navigate("char-create")}>Edit Character</button>
      </div>
    {:else}
      <div class="char-summary is-empty">
        <div class="char-summary-header">Character</div>
        <div class="char-details">No character selected yet.</div>
        <button class="btn-accent small" onclick={() => navigate("char-create")}> New Character </button>
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
  .char-summary {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .char-summary.is-empty {
    gap: 0.6rem;
  }
  .char-summary .small {
    align-self: flex-start;
    margin-top: 0.5rem;
  }
  .saved-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .saved-select-wrap {
    position: relative;
    flex: 1;
  }
  .saved-select-btn {
    width: 100%;
    flex: 1;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    padding: 0.6rem 0.75rem;
    padding-right: 2rem;
    font-size: 0.95rem;
    font-family: var(--font-ui);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
    cursor: pointer;
  }
  .saved-select-btn:focus {
    outline: none;
    border-color: var(--accent);
  }
  .saved-select-btn:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }
  .saved-caret {
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    border-top: 6px solid var(--text-dim);
  }
  .saved-select-menu {
    position: absolute;
    top: calc(100% + 6px);
    left: 0;
    right: 0;
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    z-index: 20;
    max-height: 220px;
    overflow-y: auto;
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.35);
  }
  .saved-select-item {
    width: 100%;
    text-align: left;
    background: none;
    border: none;
    color: var(--text);
    font-family: var(--font-ui);
    font-size: 0.95rem;
    padding: 0.55rem 0.75rem;
    cursor: pointer;
  }
  .saved-select-item:hover {
    background: var(--bg-action);
  }
  .npc-summary {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .npc-summary-header {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
  }
  .npc-list {
    display: grid;
    gap: 0.75rem;
  }
  .npc-card {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .npc-name {
    font-size: 1rem;
    font-family: var(--font-story);
    color: var(--text);
  }
  .npc-details,
  .npc-traits {
    font-size: 0.85rem;
    color: var(--text-dim);
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
</style>
