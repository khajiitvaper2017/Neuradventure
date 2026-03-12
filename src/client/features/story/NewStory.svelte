<script lang="ts">
  import { onMount } from "svelte"
  import type {
    MainCharacterState,
    NPCState,
    StoryCharacterGroup,
    StoryNpcGroup,
    StoryModules,
  } from "../../api/client.js"
  import { api } from "../../api/client.js"
  import { navigate, showError } from "../../stores/ui.js"
  import { autoresize } from "../../utils/actions/autoresize.js"
  import { loadStoryById } from "../../utils/storyLoader.js"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "../../utils/promptHistory.js"
  import IconPencilSquare from "../../components/icons/IconPencilSquare.svelte"
  import PromptHistoryPanel from "../../components/ui/PromptHistoryPanel.svelte"
  import StoryModulesPanel from "../../components/ui/StoryModulesPanel.svelte"
  import { generateStoryFromDescription } from "./actions.js"
  import {
    pendingCharacter,
    pendingStoryTitle,
    pendingStoryScenario,
    pendingStoryNPCs,
    pendingStoryLocation,
    pendingStoryDate,
    pendingStoryTime,
    pendingStoryGenerateDescription,
    pendingCharacterId,
    pendingStoryModules,
  } from "../../stores/game.js"
  import { storyDefaults } from "../../stores/settings.js"

  let submitting = false
  let generating = false
  let savedCharacters: StoryCharacterGroup[] = []
  let loadingCharacters = false
  let loadingNpcs = false
  let showCharacterDropdown = false
  let savedNpcs: StoryNpcGroup[] = []
  let selectedPlayableKey: string | null = null
  let storyPromptHistory: string[] = []
  let activeModules: StoryModules = $pendingStoryModules ?? $storyDefaults

  const STORY_PROMPT_HISTORY_KEY = "na:prompt_history:story"

  onMount(() => {
    loadCharacters()
    loadNpcs()
    storyPromptHistory = loadPromptHistory(STORY_PROMPT_HISTORY_KEY)
    if (!$pendingStoryModules) pendingStoryModules.set($storyDefaults)
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

  function useStoryPrompt(value: string) {
    pendingStoryGenerateDescription.set(value)
  }

  function deleteStoryPrompt(value: string) {
    storyPromptHistory = removePromptHistory(STORY_PROMPT_HISTORY_KEY, value)
  }

  function setModules(next: StoryModules) {
    pendingStoryModules.set(next)
  }

  type StoryRef = { id: number; title: string; updated_at: string }
  type PlayableOption = {
    key: string
    kind: "character" | "npc"
    name: string
    storyLabel: string
  }

  $: activeModules = $pendingStoryModules ?? $storyDefaults

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
    if (generating) return
    const prompt = $pendingStoryGenerateDescription.trim()
    if (!prompt || !$pendingCharacter) return
    generating = true
    try {
      storyPromptHistory = savePromptHistory(STORY_PROMPT_HISTORY_KEY, prompt)
      const modules = $pendingStoryModules ?? $storyDefaults
      const result = await generateStoryFromDescription(prompt, $pendingCharacter, modules)
      pendingStoryTitle.set(result.title)
      pendingStoryScenario.set(result.opening_scenario)
      pendingStoryLocation.set(result.starting_location)
      pendingStoryDate.set(result.starting_date)
      pendingStoryTime.set(result.starting_time)
      pendingStoryNPCs.set(result.pregen_npcs ?? [])
      const updatedCharacter =
        modules.character_detail_mode === "general"
          ? {
              ...$pendingCharacter,
              general_description: result.character_general_description ?? $pendingCharacter.general_description ?? "",
            }
          : {
              ...$pendingCharacter,
              current_appearance: result.current_appearance ?? $pendingCharacter.current_appearance,
            }
      pendingCharacter.set(updatedCharacter)
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
    if (charData) {
      const missing: string[] = []
      if (($pendingStoryModules?.character_detail_mode ?? "detailed") === "detailed") {
        if (!charData.current_appearance?.trim()) missing.push("Current appearance")
      } else if (!charData.general_description?.trim()) {
        missing.push("General description")
      }
      if (missing.length > 0) {
        showError(`Missing ${missing.join(", ")}. Generate the story or fill these fields.`)
        return
      }
    }

    submitting = true
    try {
      const payload: {
        title: string
        opening_scenario: string
        starting_scene?: string
        starting_date?: string
        starting_time?: string
        character_id?: number
        character_data?: Omit<MainCharacterState, "inventory">
        npcs?: NPCState[]
        story_modules?: StoryModules
      } = {
        title: $pendingStoryTitle.trim(),
        opening_scenario: $pendingStoryScenario.trim(),
        starting_scene: $pendingStoryLocation.trim() || undefined,
        starting_date: $pendingStoryDate.trim() || undefined,
        starting_time: $pendingStoryTime.trim() || undefined,
        npcs: $pendingStoryNPCs,
        story_modules: $pendingStoryModules ?? $storyDefaults,
      }
      if ($pendingCharacterId) {
        payload.character_id = $pendingCharacterId
        if (charData) payload.character_data = charData
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
      pendingStoryDate.set("")
      pendingStoryTime.set("")
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
      <PromptHistoryPanel items={storyPromptHistory} onUse={useStoryPrompt} onDelete={deleteStoryPrompt} />
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

    <div class="field">
      <div class="modules-shell">
        <div class="modules-shell-header">Story Modules</div>
        <div class="modules-shell-body">
          <StoryModulesPanel modules={activeModules} {setModules} bare />
        </div>
      </div>
    </div>

    {#if $pendingStoryNPCs.length > 0}
      <div class="shared-summary shared-summary--roomy">
        <div class="shared-summary__header">Pre-generated Characters</div>
        <div class="shared-summary__list">
          {#each $pendingStoryNPCs as npc}
            <div class="shared-card">
              <div class="shared-summary__name">{npc.name}</div>
              <div class="shared-summary__details">
                {npc.race} · {npc.current_location || "Unknown"}
              </div>
              <div class="shared-summary__details">
                {[...npc.personality_traits, ...npc.quirks, ...npc.perks].join(", ") || "No traits"}
              </div>
            </div>
          {/each}
        </div>
      </div>
    {/if}

    <div class="field">
      <label for="saved-character">Use Character From Stories</label>
      <div class="shared-select-row">
        <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
        <div class="shared-select-wrap" onclick={(e) => e.stopPropagation()}>
          <button
            id="saved-character"
            class="shared-select-btn"
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
            <span class="shared-select-caret"></span>
          </button>
          {#if showCharacterDropdown}
            <div class="shared-select-menu" role="listbox">
              {#each playableOptions as option}
                <button
                  class="shared-select-item"
                  role="option"
                  aria-selected={selectedPlayableKey === option.key}
                  onclick={() => selectPlayable(option.key)}
                >
                  <span class="shared-select-name">
                    {option.name}
                    {option.kind === "npc" ? " (NPC)" : ""}
                  </span>
                  <span class="shared-select-meta">{option.storyLabel}</span>
                </button>
              {/each}
            </div>
          {/if}
        </div>
        <button class="btn-ghost" onclick={() => navigate("char-create")}> New </button>
        <button class="btn-ghost" onclick={refreshPlayable} disabled={loadingCharacters || loadingNpcs}>
          Refresh
        </button>
      </div>
    </div>

    {#if charData}
      <div class="shared-summary shared-summary--tight">
        <div class="shared-summary__header">Character</div>
        <div class="shared-summary__name shared-summary__name--lg">{charData.name}</div>
        <div class="shared-summary__details">
          {charData.gender} ·
          {[...charData.personality_traits, ...charData.quirks, ...charData.perks].join(", ") || "No traits"}
        </div>
        <button
          class="btn-ghost small edit-character-btn"
          onclick={() => navigate("char-create")}
          title="Edit character"
          aria-label="Edit character"
        >
          <IconPencilSquare size={12} strokeWidth={2} />
          <span>Character</span>
        </button>
      </div>
    {:else}
      <div class="shared-summary shared-summary--empty">
        <div class="shared-summary__header">Character</div>
        <div class="shared-summary__details">No character selected yet.</div>
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
  .edit-character-btn {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }
</style>
