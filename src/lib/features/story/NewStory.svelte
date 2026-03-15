<script lang="ts">
  import { onMount } from "svelte"
  import type { MainCharacterState, NPCState, StoryModules } from "@/shared/types"
  import type { StoryCharacterGroup, StoryNpcGroup } from "@/shared/api-types"
  import { stories as storiesService } from "@/services/stories"
  import { streamClient } from "@/services/stream"
  import { navigate, openCharSheetForCharacter, showError } from "@/stores/ui"
  import { autoresize } from "@/utils/actions/autoresize"
  import { loadStoryById } from "@/utils/storyLoader"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "@/utils/promptHistory"
  import { createRequestId } from "@/utils/ids"
  import { clearPendingRequest, getPendingRequest, setPendingRequest } from "@/utils/pendingRequests"
  import IconDocument from "@/components/icons/IconDocument.svelte"
  import IconPencilSquare from "@/components/icons/IconPencilSquare.svelte"
  import PromptHistoryPanel from "@/components/panels/PromptHistoryPanel.svelte"
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import NpcLibraryPicker from "@/features/story/NpcLibraryPicker.svelte"
  import { generateStoryFromDescription } from "@/features/story/actions"
  import { characterToNpc } from "@/utils/characterToNpc"
  import {
    pendingCharacter,
    pendingStoryTitle,
    pendingStoryScenario,
    pendingStoryNPCs,
    pendingStoryNpcCharacterIds,
    pendingStoryLocation,
    pendingStoryDate,
    pendingStoryTime,
    pendingStoryGenerateDescription,
    pendingCharacterId,
    pendingCharacterImportCard,
    pendingCharacterImportAvatarDataUrl,
    pendingStoryModules,
  } from "@/stores/game"
  import { storyDefaults, streamingEnabled } from "@/stores/settings"

  let submitting = false
  let generating = false
  let showModulesPanel = false
  let savedCharacters: StoryCharacterGroup[] = []
  let loadingCharacters = false
  let loadingNpcs = false
  let showCharacterDropdown = false
  let savedNpcs: StoryNpcGroup[] = []
  let selectedPlayableKey: string | null = null
  let selectedCharacterIdForSheet: number | null = null
  let storyPromptHistory: string[] = []
  let activeModules: StoryModules = $pendingStoryModules ?? $storyDefaults

  const STORY_PROMPT_HISTORY_KEY = "na:prompt_history:story"

  onMount(() => {
    loadCharacters()
    loadNpcs()
    void loadPromptHistory(STORY_PROMPT_HISTORY_KEY).then((items) => {
      storyPromptHistory = items
    })
    if (!$pendingStoryModules) pendingStoryModules.set($storyDefaults)
    const pending = getPendingRequest<{
      prompt: string
      character: Omit<MainCharacterState, "inventory">
      modules: StoryModules
    }>("generate.story")
    if (pending) {
      pendingStoryGenerateDescription.set(pending.payload.prompt)
      pendingCharacter.set(pending.payload.character)
      pendingStoryModules.set(pending.payload.modules)
      void runGenerateStory(
        pending.payload.prompt,
        pending.payload.character,
        pending.payload.modules,
        pending.requestId,
      )
    }
  })

  async function loadCharacters() {
    loadingCharacters = true
    try {
      savedCharacters = await storiesService.characters()
    } catch {
      showError("Failed to load characters")
    } finally {
      loadingCharacters = false
    }
  }

  async function loadNpcs() {
    loadingNpcs = true
    try {
      savedNpcs = await storiesService.npcs()
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
    void removePromptHistory(STORY_PROMPT_HISTORY_KEY, value).then((items) => {
      storyPromptHistory = items
    })
  }

  function setModules(next: StoryModules) {
    pendingStoryModules.set(next)
  }

  function setNpcCharacterIds(nextIds: number[]) {
    const unique = Array.from(new Set(nextIds)).filter((id) => Number.isFinite(id) && id > 0)
    pendingStoryNpcCharacterIds.set(unique)
  }

  const PLAYER_MODULE_KEYS: (keyof StoryModules)[] = [
    "character_appearance_clothing",
    "character_personality_traits",
    "character_major_flaws",
    "character_quirks",
    "character_perks",
    "character_inventory",
  ]
  const NPC_MODULE_KEYS: (keyof StoryModules)[] = [
    "npc_appearance_clothing",
    "npc_personality_traits",
    "npc_major_flaws",
    "npc_quirks",
    "npc_perks",
    "npc_location",
    "npc_activity",
  ]

  function countEnabled(modules: StoryModules, keys: (keyof StoryModules)[]): number {
    return keys.reduce((acc, k) => acc + (modules[k] === true ? 1 : 0), 0)
  }

  type StoryRef = { id: number; title: string; updated_at: string }
  type PlayableOption = {
    key: string
    kind: "character" | "npc"
    name: string
    storyLabel: string
  }

  $: activeModules = $pendingStoryModules ?? $storyDefaults
  $: modulesPreviewCore = `Core: ${activeModules.track_npcs ? "NPCs on" : "NPCs off"} · ${
    activeModules.track_locations ? "Locations on" : "Locations off"
  } · Appearance: ${activeModules.character_appearance_clothing ? "on" : "off"}`
  $: modulesPreviewPlayer = `Player fields: ${countEnabled(activeModules, PLAYER_MODULE_KEYS)}/${PLAYER_MODULE_KEYS.length}`
  $: modulesPreviewNpc = activeModules.track_npcs
    ? `NPC fields: ${countEnabled(activeModules, NPC_MODULE_KEYS)}/${NPC_MODULE_KEYS.length}`
    : "NPC fields: — (tracking off)"

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

  function characterIdFromKey(key: string | null): number | null {
    if (!key || !key.startsWith("char_")) return null
    const id = Number(key.slice(5))
    if (!Number.isFinite(id) || id <= 0) return null
    return id
  }

  $: if ($pendingCharacterId) {
    selectedPlayableKey = `char_${$pendingCharacterId}`
  } else if (!$pendingCharacter && selectedPlayableKey?.startsWith("char_")) {
    selectedPlayableKey = null
  }

  $: selectedCharacterIdForSheet = characterIdFromKey(selectedPlayableKey)

  $: if ($pendingCharacterId && $pendingStoryNpcCharacterIds.includes($pendingCharacterId)) {
    pendingStoryNpcCharacterIds.set($pendingStoryNpcCharacterIds.filter((id) => id !== $pendingCharacterId))
  }

  $: selectedOption = playableOptions.find((o) => o.key === selectedPlayableKey) ?? null
  $: selectedCharacterLabel = selectedOption
    ? `${selectedOption.name} — ${selectedOption.storyLabel}${selectedOption.kind === "npc" ? " (NPC)" : ""}`
    : $pendingCharacter
      ? $pendingCharacter.name
      : "Select a character"

  async function runGenerateStory(
    prompt: string,
    character: Omit<MainCharacterState, "inventory">,
    modules: StoryModules,
    requestId: string,
  ) {
    if (generating) return
    const trimmed = prompt.trim()
    if (!trimmed) return
    generating = true
    setPendingRequest({
      kind: "generate.story",
      requestId,
      createdAt: Date.now(),
      payload: { prompt: trimmed, character, modules },
    })
    const unsub = $streamingEnabled
      ? streamClient.subscribe(requestId, (msg) => {
          const patch =
            msg.type === "subscribed"
              ? ((msg.snapshot ?? {}) as Record<string, unknown>)
              : msg.type === "stream" && msg.event === "preview"
                ? (msg.patch as Record<string, unknown>)
                : null
          if (!patch) return
          if (typeof patch.title === "string") pendingStoryTitle.set(patch.title)
          if (typeof patch.opening_scenario === "string") pendingStoryScenario.set(patch.opening_scenario)
          if (typeof patch.starting_location === "string") pendingStoryLocation.set(patch.starting_location)
          if (typeof patch.starting_date === "string") pendingStoryDate.set(patch.starting_date)
          if (typeof patch.starting_time === "string") pendingStoryTime.set(patch.starting_time)
          if (typeof patch.general_description === "string" || typeof patch.current_appearance === "string") {
            pendingCharacter.update((c) => {
              if (!c) return c
              return {
                ...c,
                ...(typeof patch.general_description === "string"
                  ? { general_description: patch.general_description }
                  : {}),
                ...(modules.character_appearance_clothing && typeof patch.current_appearance === "string"
                  ? { current_appearance: patch.current_appearance }
                  : {}),
              }
            })
          }
        })
      : null
    try {
      storyPromptHistory = await savePromptHistory(STORY_PROMPT_HISTORY_KEY, trimmed)
      const result = await generateStoryFromDescription(trimmed, character, modules, requestId)
      pendingStoryTitle.set(result.title)
      pendingStoryScenario.set(result.opening_scenario)
      pendingStoryLocation.set(result.starting_location)
      pendingStoryDate.set(result.starting_date)
      pendingStoryTime.set(result.starting_time)
      pendingStoryNPCs.set(result.pregen_npcs ?? [])
      const updatedCharacter = {
        ...character,
        general_description: result.general_description,
        ...(modules.character_appearance_clothing
          ? { current_appearance: result.current_appearance ?? character.current_appearance }
          : {}),
      }
      pendingCharacter.set(updatedCharacter)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      clearPendingRequest("generate.story", requestId)
      generating = false
      unsub?.()
    }
  }

  async function generate() {
    if (generating) return
    const prompt = $pendingStoryGenerateDescription.trim()
    if (!prompt || !$pendingCharacter) return
    const requestId = createRequestId()
    const modules = $pendingStoryModules ?? $storyDefaults
    await runGenerateStory(prompt, $pendingCharacter, modules, requestId)
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
      const useAppearance = $pendingStoryModules?.character_appearance_clothing ?? true
      if (!charData.general_description?.trim()) missing.push("Description")
      if (useAppearance && !charData.current_appearance?.trim()) missing.push("Current appearance")
      if (missing.length > 0) {
        showError(`Missing ${missing.join(", ")}. Generate the story or fill these fields.`)
        return
      }
    }

    submitting = true
    try {
      const npcFromLibrary = activeModules.track_npcs
        ? savedCharacters
            .filter((g) => $pendingStoryNpcCharacterIds.includes(g.id))
            .map((g) => characterToNpc(g.character))
        : []
      const npcCandidates = activeModules.track_npcs ? [...$pendingStoryNPCs, ...npcFromLibrary] : []
      const dedupedNpcs = (() => {
        const seen = new Set<string>()
        const out: NPCState[] = []
        for (const npc of npcCandidates) {
          const key = (npc.name || "").trim().toLowerCase()
          if (!key) continue
          if (seen.has(key)) continue
          seen.add(key)
          out.push(npc)
        }
        return out
      })()

      const payload: {
        title: string
        opening_scenario: string
        starting_scene?: string
        starting_date?: string
        starting_time?: string
        character_id?: number
        tavern_card?: object
        tavern_avatar_data_url?: string
        character_data?: Omit<MainCharacterState, "inventory">
        npcs?: NPCState[]
        story_modules?: StoryModules
      } = {
        title: $pendingStoryTitle.trim(),
        opening_scenario: $pendingStoryScenario.trim(),
        starting_scene: $pendingStoryLocation.trim() || undefined,
        starting_date: $pendingStoryDate.trim() || undefined,
        starting_time: $pendingStoryTime.trim() || undefined,
        npcs: dedupedNpcs,
        story_modules: $pendingStoryModules ?? $storyDefaults,
      }
      if ($pendingCharacterId) {
        payload.character_id = $pendingCharacterId
        if (charData) payload.character_data = charData
      } else if (charData) {
        payload.character_data = charData
        if ($pendingCharacterImportCard) payload.tavern_card = $pendingCharacterImportCard
        if ($pendingCharacterImportAvatarDataUrl) payload.tavern_avatar_data_url = $pendingCharacterImportAvatarDataUrl
      }
      const { id } = await storiesService.create(payload)
      await loadStoryById(id)
      pendingCharacter.set(null)
      pendingCharacterId.set(null)
      pendingCharacterImportCard.set(null)
      pendingCharacterImportAvatarDataUrl.set(null)
      pendingStoryTitle.set("")
      pendingStoryScenario.set("")
      pendingStoryNPCs.set([])
      pendingStoryNpcCharacterIds.set([])
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
        <div class="modules-shell-header">
          <span>Story Modules</span>
          <button
            class="modules-shell-action"
            onclick={() => (showModulesPanel = true)}
            disabled={generating || submitting}
          >
            Edit
          </button>
        </div>
        <div class="modules-shell-body">
          <div class="modules-shell-summary">
            <div class="modules-shell-line">{modulesPreviewCore}</div>
            <div class="modules-shell-line">{modulesPreviewPlayer}</div>
            <div class="modules-shell-line">{modulesPreviewNpc}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="field">
      <NpcLibraryPicker
        characters={savedCharacters}
        selectedIds={$pendingStoryNpcCharacterIds}
        disabled={!activeModules.track_npcs}
        locked={generating || submitting}
        excludeCharacterId={$pendingCharacterId}
        onChange={setNpcCharacterIds}
        onOpenModules={() => (showModulesPanel = true)}
      />
    </div>

    {#if $pendingStoryNPCs.length > 0}
      <div class="shared-summary shared-summary--roomy">
        <div class="shared-summary__header">Generated NPCs</div>
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
            disabled={generating || submitting || loadingCharacters || loadingNpcs || !hasPlayableOptions}
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
              {#each playableOptions as option (option.key)}
                <div class="shared-select-item-row">
                  <button
                    class="shared-select-item"
                    role="option"
                    aria-selected={selectedPlayableKey === option.key}
                    onclick={() => selectPlayable(option.key)}
                    disabled={generating || submitting}
                  >
                    <span class="shared-select-name">
                      {option.name}
                      {option.kind === "npc" ? " (NPC)" : ""}
                    </span>
                    <span class="shared-select-meta">{option.storyLabel}</span>
                  </button>
                  {#if option.kind === "character"}
                    <button
                      class="shared-select-item-action"
                      title="Details"
                      aria-label="Character details"
                      disabled={generating || submitting}
                      onclick={(e) => {
                        e.stopPropagation()
                        const id = characterIdFromKey(option.key)
                        if (!id) return
                        showCharacterDropdown = false
                        openCharSheetForCharacter(id)
                      }}
                    >
                      <IconDocument size={16} strokeWidth={1.6} />
                    </button>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}
        </div>
        <button class="btn-ghost" onclick={() => navigate("char-create")} disabled={generating || submitting}>
          New
        </button>
        <button
          class="btn-ghost btn-icon"
          onclick={() => {
            if (!selectedCharacterIdForSheet) return
            showCharacterDropdown = false
            openCharSheetForCharacter(selectedCharacterIdForSheet)
          }}
          disabled={generating || submitting || !selectedCharacterIdForSheet}
          title={selectedCharacterIdForSheet ? "Character details" : "Details available for story characters only"}
        >
          <IconDocument size={16} strokeWidth={1.6} />
          Details
        </button>
        <button
          class="btn-ghost"
          onclick={refreshPlayable}
          disabled={generating || submitting || loadingCharacters || loadingNpcs}
        >
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
          disabled={generating || submitting}
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
        <button class="btn-accent small" onclick={() => navigate("char-create")} disabled={generating || submitting}>
          New Character
        </button>
      </div>
    {/if}
  </div>

  {#if showModulesPanel}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="overlay" onclick={() => (showModulesPanel = false)}></div>
    <div class="panel panel--wide">
      <div class="panel-header">
        <span>Story Modules</span>
        <button class="panel-close" onclick={() => (showModulesPanel = false)} aria-label="Close">×</button>
      </div>
      <div class="panel-body" data-scroll-root="modal">
        <StoryModulesPanel modules={activeModules} {setModules} bare />
      </div>
    </div>
  {/if}

  <div class="actions">
    <button class="btn-accent full" onclick={startAdventure} disabled={submitting || generating}>
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
