<script lang="ts">
  import { onMount } from "svelte"
  import type { MainCharacterState, NPCState, StoryModules } from "@/shared/types"
  import type { StoryCharacterGroup, StoryNpcGroup } from "@/shared/api-types"
  import { stories as storiesService } from "@/services/stories"
  import { subscribeStreamPreview } from "@/services/streamPreview"
  import { navigate, openCharSheetForCharacter } from "@/stores/router"
  import { showError } from "@/stores/ui"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "@/utils/promptHistory"
  import { createRequestId } from "@/utils/ids"
  import { clearPendingRequest, getPendingRequest, setPendingRequest } from "@/utils/pendingRequests"
  import { cn } from "@/utils.js"
  import { FileText, SquarePen } from "@lucide/svelte"
  import PromptHistoryPanel from "@/components/panels/PromptHistoryPanel.svelte"
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import * as Select from "@/components/ui/select"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Sheet, SheetContent } from "@/components/ui/sheet"
  import { Textarea } from "@/components/ui/textarea"
  import { ScrollArea } from "@/components/ui/scroll-area"
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
  import {
    countAllEnabled,
    storyModulesPreviewCore,
    storyModulesPreviewNpc,
    storyModulesPreviewPlayer,
  } from "@/shared/story-modules"

  let submitting = $state(false)
  let generating = $state(false)
  let showModulesPanel = $state(false)
  let savedCharacters = $state<StoryCharacterGroup[]>([])
  let loadingCharacters = $state(false)
  let loadingNpcs = $state(false)
  let savedNpcs = $state<StoryNpcGroup[]>([])
  let selectedNpcPlayableKey = $state<string | null>(null)
  let storyPromptHistory = $state<string[]>([])

  const STORY_PROMPT_HISTORY_KEY = "na:prompt_history:story"

  onMount(() => {
    loadPlayableLibrary()
    void loadPromptHistory(STORY_PROMPT_HISTORY_KEY).then((items) => {
      storyPromptHistory = items
    })
    if (!$pendingStoryModules) pendingStoryModules.set($storyDefaults)
    if ($pendingCharacterId && $pendingStoryNpcCharacterIds.includes($pendingCharacterId)) {
      pendingStoryNpcCharacterIds.set($pendingStoryNpcCharacterIds.filter((id) => id !== $pendingCharacterId))
    }
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

  async function loadPlayableLibrary() {
    loadingCharacters = true
    loadingNpcs = true
    try {
      const [charactersResult, npcResult] = await Promise.allSettled([
        storiesService.characters(),
        storiesService.npcs(),
      ])
      if (charactersResult.status === "fulfilled") {
        savedCharacters = charactersResult.value
      } else {
        showError("Failed to load characters")
      }
      if (npcResult.status === "fulfilled") {
        savedNpcs = npcResult.value
      } else {
        showError("Failed to load NPCs")
      }
    } finally {
      loadingCharacters = false
      loadingNpcs = false
    }
  }

  function refreshPlayable() {
    loadPlayableLibrary()
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

  type StoryRef = { id: number; title: string; updated_at: string }
  type PlayableOption = {
    key: string
    kind: "character" | "npc"
    name: string
    storyLabel: string
  }

  const activeModules: StoryModules = $derived($pendingStoryModules ?? $storyDefaults)
  const modulesEnabledCount = $derived.by(() => countAllEnabled(activeModules))
  const modulesPreviewCore = $derived.by(() => storyModulesPreviewCore(activeModules))
  const modulesPreviewPlayer = $derived.by(() => storyModulesPreviewPlayer(activeModules))
  const modulesPreviewNpc = $derived.by(() => storyModulesPreviewNpc(activeModules))

  function formatStoryLabel(stories: StoryRef[]): string {
    if (!stories || stories.length === 0) return "No story yet"
    const sorted = [...stories].sort((a, b) => b.updated_at.localeCompare(a.updated_at))
    const titles = sorted.map((s) => s.title).filter(Boolean)
    const shown = titles.slice(0, 2)
    const extra = titles.length - shown.length
    if (shown.length === 0) return "No story yet"
    return extra > 0 ? `${shown.join(", ")} +${extra} more` : shown.join(", ")
  }

  const playableOptions: PlayableOption[] = $derived([
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
  ])

  const hasPlayableOptions = $derived(playableOptions.length > 0)

  const selectedPlayableKey = $derived.by(() => {
    if ($pendingCharacterId) return `char_${$pendingCharacterId}`
    if (!selectedNpcPlayableKey) return null
    return playableOptions.some((o) => o.key === selectedNpcPlayableKey) ? selectedNpcPlayableKey : null
  })

  function selectPlayable(key: string) {
    const option = playableOptions.find((o) => o.key === key)
    if (!option) return
    if (option.kind === "character") {
      const match = savedCharacters.find((c) => `char_${c.id}` === key)
      if (match) {
        pendingCharacter.set(match.character)
        pendingCharacterId.set(match.id)
        if ($pendingStoryNpcCharacterIds.includes(match.id)) {
          pendingStoryNpcCharacterIds.set($pendingStoryNpcCharacterIds.filter((id) => id !== match.id))
        }
        selectedNpcPlayableKey = null
      }
    } else {
      const match = savedNpcs.find((n) => n.key === key)
      if (match) {
        pendingCharacter.set(match.npc)
        pendingCharacterId.set(null)
        selectedNpcPlayableKey = key
      }
    }
  }

  const selectedCharacterIdForSheet = $derived($pendingCharacterId)

  const selectedOption = $derived(playableOptions.find((o) => o.key === selectedPlayableKey) ?? null)
  const playableSelectOptions = $derived(
    playableOptions.map((o) => ({
      value: o.key,
      label: `${o.name}${o.kind === "npc" ? " (NPC)" : ""}`,
    })),
  )
  const playableSelectLabel = $derived(playableSelectOptions.find((o) => o.value === selectedPlayableKey)?.label ?? "")

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
      ? subscribeStreamPreview(requestId, (patch) => {
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

  const charData = $derived($pendingCharacter)

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
      if (!charData.general_description?.trim()) missing.push("Description")
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

<div class="mx-auto flex h-dvh w-full max-w-3xl flex-col">
  <header class="flex items-center gap-3 border-b px-4 py-3">
    <Button variant="ghost" class="-ml-2" onclick={() => navigate("home")}>← Back</Button>
    <h2 class="text-base font-semibold text-foreground">New Story</h2>
  </header>

  <ScrollArea class="min-h-0 flex-1">
    <div class="px-4 py-4">
      <div class="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Generate from description</CardTitle>
            <CardDescription>Optional: generate modules, character, and NPCs from a prompt.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="flex items-start gap-2">
              <Textarea
                id="story-generate"
                bind:value={$pendingStoryGenerateDescription}
                placeholder="e.g. a heist in a magical library full of forbidden knowledge"
                rows={2}
              />
              <Button
                variant="outline"
                class="shrink-0"
                onclick={generate}
                disabled={generating || !$pendingStoryGenerateDescription.trim()}
              >
                {generating ? "Generating..." : "✦ Generate"}
              </Button>
            </div>
            <PromptHistoryPanel items={storyPromptHistory} onUse={useStoryPrompt} onDelete={deleteStoryPrompt} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Character</CardTitle>
            <CardDescription>Pick a saved character (or NPC) to play as.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            {#if loadingCharacters || loadingNpcs}
              <div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Loading characters…</div>
            {:else if !hasPlayableOptions}
              <div class="rounded-lg border border-dashed bg-card p-6 text-center text-sm text-muted-foreground">
                No characters yet.
              </div>
            {:else}
              <div class="flex flex-wrap items-center gap-2">
                <div class="min-w-[14rem] flex-1">
                  <Select.Root
                    type="single"
                    value={selectedPlayableKey ?? ""}
                    items={playableSelectOptions}
                    disabled={generating || submitting || loadingCharacters || loadingNpcs || !hasPlayableOptions}
                    onValueChange={(next) => selectPlayable(next)}
                  >
                    <Select.Trigger
                      class="w-full"
                      aria-label="Character"
                      data-placeholder={!selectedPlayableKey ? true : undefined}
                    >
                      {selectedPlayableKey ? playableSelectLabel : "Select a character…"}
                    </Select.Trigger>
                    <Select.Content>
                      {#each playableSelectOptions as option (option.value)}
                        <Select.Item {...option} />
                      {/each}
                    </Select.Content>
                  </Select.Root>
                </div>
                <Button variant="outline" onclick={() => navigate("char-create")} disabled={generating || submitting}
                  >New</Button
                >
                <Button
                  variant="outline"
                  onclick={() => {
                    if (!selectedCharacterIdForSheet) return
                    openCharSheetForCharacter(selectedCharacterIdForSheet)
                  }}
                  disabled={generating || submitting || !selectedCharacterIdForSheet}
                  title={selectedCharacterIdForSheet
                    ? "Character details"
                    : "Details available for story characters only"}
                >
                  <FileText size={16} strokeWidth={1.6} aria-hidden="true" />
                  Details
                </Button>
                <Button
                  variant="outline"
                  onclick={refreshPlayable}
                  disabled={generating || submitting || loadingCharacters || loadingNpcs}
                >
                  Refresh
                </Button>
              </div>
            {/if}

            {#if charData}
              <div class="rounded-lg border bg-card p-4">
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selected</div>
                <div class="mt-2 text-lg font-semibold text-foreground">{charData.name}</div>
                <div class="mt-1 text-sm text-muted-foreground">
                  {charData.gender} · {[...charData.personality_traits, ...charData.perks].join(", ") || "No traits"}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  class="mt-3"
                  onclick={() => navigate("char-create")}
                  disabled={generating || submitting}
                  title="Edit character"
                  aria-label="Edit character"
                >
                  <SquarePen size={12} strokeWidth={2} aria-hidden="true" />
                  Character
                </Button>
              </div>
            {:else}
              <div class="rounded-lg border border-dashed bg-card p-4">
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Selected</div>
                <div class="mt-2 text-sm text-muted-foreground">No character selected yet.</div>
                <Button class="mt-3" onclick={() => navigate("char-create")} disabled={generating || submitting}>
                  New Character
                </Button>
              </div>
            {/if}
          </CardContent>
        </Card>

        <div class="space-y-2">
          <Label for="story-title">Story Title</Label>
          <Input id="story-title" type="text" bind:value={$pendingStoryTitle} placeholder="Name your adventure..." />
        </div>

        <div class="space-y-2">
          <Label for="story-scenario">Opening Scenario</Label>
          <Textarea
            id="story-scenario"
            bind:value={$pendingStoryScenario}
            placeholder="Describe the starting situation. Where is your character? What's happening?"
            rows={6}
          />
        </div>

        <div class="space-y-2">
          <Label for="story-location">Starting Location</Label>
          <Input
            id="story-location"
            type="text"
            bind:value={$pendingStoryLocation}
            placeholder="e.g. The lower decks of the airship"
          />
        </div>

        <Card>
          <CardHeader class="flex-row items-start justify-between gap-3 space-y-0">
            <div class="space-y-1">
              <CardTitle>Story Modules</CardTitle>
              <CardDescription>Configure which systems are active for this story.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              class="h-8 gap-2"
              onclick={() => (showModulesPanel = true)}
              disabled={generating || submitting}
            >
              Modules
              <Badge variant="secondary" class="h-5 px-1.5 font-mono text-[10px] tabular-nums">
                {modulesEnabledCount}
              </Badge>
            </Button>
          </CardHeader>
          <CardContent class="space-y-1 text-sm text-muted-foreground">
            <div>{modulesPreviewCore}</div>
            <div>{modulesPreviewPlayer}</div>
            <div>{modulesPreviewNpc}</div>
          </CardContent>
        </Card>

        <NpcLibraryPicker
          characters={savedCharacters}
          selectedIds={$pendingStoryNpcCharacterIds}
          disabled={!activeModules.track_npcs}
          locked={generating || submitting}
          excludeCharacterId={$pendingCharacterId}
          onChange={setNpcCharacterIds}
          onOpenModules={() => (showModulesPanel = true)}
        />

        {#if $pendingStoryNPCs.length > 0}
          <Card>
            <CardHeader>
              <CardTitle>Generated NPCs</CardTitle>
            </CardHeader>
            <CardContent class="grid gap-3 sm:grid-cols-2">
              {#each $pendingStoryNPCs as npc, index (npc.name + ":" + index)}
                <div class="rounded-lg border bg-card p-3">
                  <div class="text-sm font-medium text-foreground">{npc.name}</div>
                  <div class="mt-1 text-xs text-muted-foreground">{npc.race} · {npc.current_location || "Unknown"}</div>
                  <div class="mt-1 text-xs text-muted-foreground">
                    {[...npc.personality_traits, ...npc.perks].join(", ") || "No traits"}
                  </div>
                </div>
              {/each}
            </CardContent>
          </Card>
        {/if}
      </div>
    </div>
  </ScrollArea>

  <Sheet open={showModulesPanel} onOpenChange={(next) => (showModulesPanel = next)}>
    <SheetContent side="right" class="w-[min(92vw,44rem)] sm:max-w-none p-0">
      <div class="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div class="min-w-0">
          <div class="truncate text-sm font-semibold text-foreground">Story Modules</div>
          <div class="mt-0.5 text-xs text-muted-foreground">Configure which systems are active for this story.</div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          class="h-9 w-9"
          onclick={() => (showModulesPanel = false)}
          aria-label="Close"
        >
          ×
        </Button>
      </div>

      <ScrollArea class="max-h-[calc(100dvh-3.25rem)]">
        <div class="p-4">
          <StoryModulesPanel modules={activeModules} {setModules} bare />
        </div>
      </ScrollArea>
    </SheetContent>
  </Sheet>

  <div class="border-t px-4 py-4">
    <Button class="w-full" onclick={startAdventure} disabled={submitting || generating}>
      {submitting ? "Creating..." : "Start Adventure →"}
    </Button>
  </div>
</div>
