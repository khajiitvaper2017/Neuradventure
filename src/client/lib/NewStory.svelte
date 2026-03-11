<script lang="ts">
  import { onMount } from "svelte"
  import {
    api,
    type MainCharacterState,
    type NPCState,
    type StoryCharacterGroup,
    type StoryNpcGroup,
  } from "../api/client.js"
  import { navigate, showError } from "../stores/ui.js"
  import { autoresize } from "./actions/autoresize.js"
  import { loadStoryById } from "./storyLoader.js"
  import {
    pendingCharacter,
    pendingStoryTitle,
    pendingStoryScenario,
    pendingStoryNPCs,
    pendingStoryLocation,
    pendingStoryGenerateDescription,
    pendingCharacterId,
  } from "../stores/game.js"

  let submitting = false
  let generating = false
  let savedCharacters: StoryCharacterGroup[] = []
  let loadingCharacters = false
  let loadingNpcs = false
  let showCharacterDropdown = false
  let savedNpcs: StoryNpcGroup[] = []
  let selectedPlayableKey: string | null = null

  onMount(() => {
    loadCharacters()
    loadNpcs()
  })

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

  async function loadNpcs() {
    loadingNpcs = true
    try {
      savedNpcs = await api.stories.npcs()
    } catch {
      showError("Failed to load NPCs")
    } finally {
      loadingNpcs = false
    }
  }

  function refreshPlayable() {
    loadCharacters()
    loadNpcs()
  }

  type StoryRef = { id: number; title: string; updated_at: string }
  type PlayableOption = {
    key: string
    kind: "character" | "npc"
    name: string
    storyLabel: string
  }

  function formatStoryLabel(stories: StoryRef[]): string {
    if (!stories || stories.length === 0) return "No story yet"
    const sorted = [...stories].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    const titles = sorted.map((s) => s.title).filter(Boolean)
    const shown = titles.slice(0, 2)
    const extra = titles.length - shown.length
    if (shown.length === 0) return "No story yet"
    return extra > 0 ? `${shown.join(", ")} +${extra} more` : shown.join(", ")
  }

  $: playableOptions = [
    ...savedCharacters.map((c) => ({
      key: `char_${c.id}`,
      kind: "character" as const,
      name: c.character.name,
      storyLabel: formatStoryLabel(c.stories),
    })),
    ...savedNpcs.map((n) => ({
      key: n.key,
      kind: "npc" as const,
      name: n.npc.name,
      storyLabel: formatStoryLabel(n.stories),
    })),
  ]

  $: hasPlayableOptions = playableOptions.length > 0

  function toggleCharacterDropdown() {
    if (loadingCharacters || loadingNpcs || !hasPlayableOptions) return
    showCharacterDropdown = !showCharacterDropdown
  }

  function selectPlayable(key: string) {
    const option = playableOptions.find((o) => o.key === key)
    if (!option) return
    if (option.kind === "character") {
      const match = savedCharacters.find((c) => `char_${c.id}` === key)
      if (match) {
        pendingCharacter.set(match.character)
        pendingCharacterId.set(match.id)
      }
    } else {
      const match = savedNpcs.find((n) => n.key === key)
      if (match) {
        pendingCharacter.set(match.npc)
        pendingCharacterId.set(null)
      }
    }
    selectedPlayableKey = key
    showCharacterDropdown = false
  }

  $: if ($pendingCharacterId) {
    selectedPlayableKey = `char_${$pendingCharacterId}`
  } else if (!$pendingCharacter && selectedPlayableKey?.startsWith("char_")) {
    selectedPlayableKey = null
  }

  $: selectedOption = playableOptions.find((o) => o.key === selectedPlayableKey) ?? null
  $: selectedCharacterLabel = selectedOption
    ? `${selectedOption.name} — ${selectedOption.storyLabel}${selectedOption.kind === "npc" ? " (NPC)" : ""}`
    : $pendingCharacter
      ? $pendingCharacter.name
      : "Select a character"

  async function generate() {
    if (!$pendingStoryGenerateDescription.trim() || !$pendingCharacter) return
    generating = true
    try {
      const result = await api.generate.story($pendingStoryGenerateDescription.trim(), $pendingCharacter)
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
    if (!charData && !$pendingCharacterId) {
      showError("No character selected")
      return
    }

    submitting = true
    try {
      const payload: {
        title: string
        opening_scenario: string
        starting_scene?: string
        character_id?: number
        character_data?: Omit<MainCharacterState, "inventory">
        npcs?: NPCState[]
      } = {
        title: $pendingStoryTitle.trim(),
        opening_scenario: $pendingStoryScenario.trim(),
        starting_scene: $pendingStoryLocation.trim() || undefined,
        npcs: $pendingStoryNPCs,
      }
      if ($pendingCharacterId) {
        payload.character_id = $pendingCharacterId
      } else if (charData) {
        payload.character_data = charData
      }
      const { id } = await api.stories.create(payload)
      await loadStoryById(id)
      pendingCharacter.set(null)
      pendingCharacterId.set(null)
      pendingStoryTitle.set("")
      pendingStoryScenario.set("")
      pendingStoryNPCs.set([])
      pendingStoryLocation.set("")
      pendingStoryGenerateDescription.set("")
      navigate("game", { reset: true, params: { storyId: id } })
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
                {npc.race} · {npc.current_location || "Unknown"}
              </div>
              <div class="npc-traits">
                {[...npc.personality_traits, ...npc.quirks, ...npc.perks].join(", ") || "No traits"}
              </div>
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
            disabled={loadingCharacters || loadingNpcs || !hasPlayableOptions}
            aria-haspopup="listbox"
            aria-expanded={showCharacterDropdown}
          >
            <span
              >{loadingCharacters || loadingNpcs
                ? "Loading characters..."
                : !hasPlayableOptions
                  ? "No characters yet"
                  : selectedCharacterLabel}</span
            >
            <span class="saved-caret"></span>
          </button>
          {#if showCharacterDropdown}
            <div class="saved-select-menu" role="listbox">
              {#each playableOptions as option}
                <button
                  class="saved-select-item"
                  role="option"
                  aria-selected={selectedPlayableKey === option.key}
                  onclick={() => selectPlayable(option.key)}
                >
                  <span class="saved-select-name">
                    {option.name}
                    {option.kind === "npc" ? " (NPC)" : ""}
                  </span>
                  <span class="saved-select-meta">{option.storyLabel}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button class="btn-ghost" onclick={() => navigate("char-create")}> New </button>
        <button class="btn-ghost" onclick={refreshPlayable} disabled={loadingCharacters || loadingNpcs}> Refresh </button>
      </div>
    </div>

    {#if charData}
      <div class="char-summary">
        <div class="char-summary-header">Character</div>
        <div class="char-name">{charData.name}</div>
        <div class="char-details">
          {charData.gender} ·
          {[...charData.personality_traits, ...charData.quirks, ...charData.perks].join(", ") || "No traits"}
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
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
  }
  .saved-select-item:hover {
    background: var(--bg-action);
  }
  .saved-select-name {
    font-size: 0.95rem;
    color: var(--text);
  }
  .saved-select-meta {
    font-size: 0.75rem;
    color: var(--text-dim);
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
