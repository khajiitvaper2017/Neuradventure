<script lang="ts">
  import { get } from "svelte/store"
  import { onMount } from "svelte"
  import { SvelteMap, SvelteSet } from "svelte/reactivity"
  import type { StoryModules } from "@/shared/types"
  import { goBack, navigate } from "@/stores/router"
  import { showError, showQuietNotice } from "@/stores/ui"
  import { cn } from "@/utils.js"
  import {
    pendingCharacter,
    pendingCharacterId,
    pendingCharacterImportText,
    pendingCharacterImportCard,
    pendingCharacterImportAvatarDataUrl,
    pendingStoryModules,
  } from "@/stores/game"
  import { pendingCharacterGenerateDescription } from "@/stores/game"
  import { storyDefaults, streamingEnabled } from "@/stores/settings"
  import personalityOptions from "@/shared/config/traits.json"
  import serverDefaults from "@/shared/config/server-defaults.json"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "@/utils/promptHistory"
  import { normalizeGender } from "@/utils/text"
  import { createRequestId } from "@/utils/ids"
  import { clearPendingRequest, getPendingRequest, setPendingRequest } from "@/utils/pendingRequests"
  import PromptHistoryPanel from "@/components/panels/PromptHistoryPanel.svelte"
  import { subscribeStreamPreview } from "@/services/streamPreview"
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
  import { Input } from "@/components/ui/input"
  import { Label } from "@/components/ui/label"
  import { Textarea } from "@/components/ui/textarea"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import {
    generateCharacterFromDescription,
    generateCharacterAppearance,
    generateCharacterClothing,
    generateCharacterTraits,
    importCharacter,
  } from "@/features/character/actions"

  const CHARACTER_PROMPT_HISTORY_KEY = "na:prompt_history:character"

  // Ordered as opposite pairs — each adjacent pair blocks each other
  const PERSONALITY_OPTIONS = personalityOptions
  const normalizeKey = (t: string) => t.trim().toLowerCase()
  const PERSONALITY_CANONICAL: Record<string, string> = Object.fromEntries(
    PERSONALITY_OPTIONS.map((t) => [normalizeKey(t), t]),
  )

  const OPPOSITES: Record<string, string> = Object.fromEntries(
    PERSONALITY_OPTIONS.reduce<[string, string][]>((acc, _, i, arr) => {
      if (i % 2 === 0) acc.push([arr[i], arr[i + 1]], [arr[i + 1], arr[i]])
      return acc
    }, []),
  )

  const existing = get(pendingCharacter)
  const splitPersonalityTraits = (traits: string[]) => {
    const cleaned = traits.map((t) => t.trim()).filter(Boolean)
    const selectedMap = new SvelteMap<string, string>()
    const customMap = new SvelteMap<string, string>()
    for (const raw of cleaned) {
      const key = normalizeKey(raw)
      const canonical = PERSONALITY_CANONICAL[key]
      if (canonical) {
        if (!selectedMap.has(key)) selectedMap.set(key, canonical)
      } else if (!customMap.has(key)) {
        customMap.set(key, raw)
      }
    }
    const selected = Array.from(selectedMap.values()).filter((_, i) => i < 5)
    const remaining = 5 - selected.length
    const custom = Array.from(customMap.values()).filter((_, i) => i < remaining)
    return { selected, custom }
  }
  const initialPersonality = splitPersonalityTraits(existing?.personality_traits ?? [])

  let generating = $state(false)
  let savingCharacter = $state(false)
  let autofilling = $state(false)
  let regeneratingAppearance = $state(false)
  let regeneratingClothing = $state(false)
  let regeneratingTraits = $state(false)
  let showModulesPanel = $state(false)
  let promptHistory = $state<string[]>([])

  onMount(() => {
    void loadPromptHistory(CHARACTER_PROMPT_HISTORY_KEY).then((items) => {
      promptHistory = items
    })
    if (!$pendingStoryModules) pendingStoryModules.set($storyDefaults)
    const pending = getPendingRequest<{ prompt: string; modules: StoryModules }>("generate.character")
    if (pending) {
      pendingCharacterGenerateDescription.set(pending.payload.prompt)
      pendingStoryModules.set(pending.payload.modules)
      void runGenerate(pending.payload.prompt, pending.payload.modules, pending.requestId)
    }
  })

  async function runGenerate(prompt: string, modules: StoryModules, requestId: string) {
    if (generating) return
    const trimmed = prompt.trim()
    if (!trimmed) return
    generating = true
    setPendingRequest({
      kind: "generate.character",
      requestId,
      createdAt: Date.now(),
      payload: { prompt: trimmed, modules },
    })
    const unsub = $streamingEnabled
      ? subscribeStreamPreview(requestId, (patch) => {
          if (typeof patch.name === "string") name = patch.name
          if (typeof patch.race === "string") race = patch.race
          if (typeof patch.gender === "string") gender = normalizeGender(patch.gender)
          if (typeof patch.general_description === "string") generalDescription = patch.general_description
          if (modules.character_appearance_clothing) {
            if (typeof patch.baseline_appearance === "string") {
              baselineAppearance = patch.baseline_appearance
            }
            if (typeof patch.current_clothing === "string") currentClothing = patch.current_clothing
          }
        })
      : null
    try {
      promptHistory = await savePromptHistory(CHARACTER_PROMPT_HISTORY_KEY, trimmed)
      const result = await generateCharacterFromDescription(trimmed, modules, requestId)
      name = result.name
      race = result.race
      gender = normalizeGender(result.gender)
      generalDescription = result.general_description ?? generalDescription

      if (modules.character_appearance_clothing) {
        if (result.baseline_appearance) {
          baselineAppearance = result.baseline_appearance
        }
        if (result.current_clothing) currentClothing = result.current_clothing
      }

      if (traitsEnabled) {
        const split = splitPersonalityTraits(result.personality_traits ?? [])
        selectedTraits = split.selected
        customPersonalityTraits = split.custom
      }
      if (majorFlawsEnabled && result.major_flaws) majorFlaws = result.major_flaws
      if (quirksEnabled && result.quirks) quirks = result.quirks
      if (perksEnabled && result.perks) perks = result.perks
    } catch (err) {
      showError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      clearPendingRequest("generate.character", requestId)
      generating = false
      unsub?.()
    }
  }

  async function generate() {
    const prompt = $pendingCharacterGenerateDescription.trim()
    if (!prompt) return
    const requestId = createRequestId()
    await runGenerate(prompt, activeModules, requestId)
  }

  const isMissingText = (value: string) => {
    const trimmed = value.trim()
    return !trimmed || /^unknown\b/i.test(trimmed)
  }

  function mergeTraits(existing: string[], incoming: string[], limit = 5): string[] {
    const seen = new SvelteSet(existing.map(normalizeKey))
    const out = [...existing]
    for (const trait of incoming) {
      const key = normalizeKey(trait)
      if (!key || seen.has(key)) continue
      out.push(trait)
      seen.add(key)
      if (out.length >= limit) break
    }
    return out
  }

  async function autofillFromImport() {
    if (autofilling) return
    const seed = $pendingCharacterImportText.trim()
    if (!seed) {
      showError("No import data available for autofill")
      return
    }
    autofilling = true
    try {
      const prompt = [
        "Use the following SillyTavern character card data to infer missing fields.",
        "Focus on race, gender, baseline appearance, clothing, personality traits, quirks, and perks.",
        seed,
      ].join("\n")
      const result = await generateCharacterFromDescription(prompt, activeModules)

      if (isMissingText(name)) name = result.name
      if (isMissingText(race)) race = result.race
      if (isMissingText(gender) || gender.toLowerCase() === "unknown") {
        gender = normalizeGender(result.gender, gender)
      }
      if (isMissingText(generalDescription) && result.general_description) {
        generalDescription = result.general_description
      }
      if (activeModules.character_appearance_clothing) {
        if (isMissingText(baselineAppearance) && result.baseline_appearance)
          baselineAppearance = result.baseline_appearance
        if (isMissingText(currentClothing) && result.current_clothing) currentClothing = result.current_clothing
      }

      if (traitsEnabled) {
        const existingTraits = [...selectedTraits, ...customPersonalityTraits]
        const generatedTraits = result.personality_traits ?? []
        if (existingTraits.length < 2) {
          const split = splitPersonalityTraits(generatedTraits)
          selectedTraits = split.selected
          customPersonalityTraits = split.custom
        } else if (existingTraits.length < 5) {
          const merged = mergeTraits(existingTraits, generatedTraits, 5)
          const split = splitPersonalityTraits(merged)
          selectedTraits = split.selected
          customPersonalityTraits = split.custom
        }
      }

      if (quirksEnabled && quirks.length === 0 && result.quirks) quirks = result.quirks
      if (majorFlawsEnabled && majorFlaws.length === 0 && result.major_flaws) majorFlaws = result.major_flaws
      if (perksEnabled && perks.length === 0 && result.perks) perks = result.perks
    } catch (err) {
      showError(err instanceof Error ? err.message : "Autofill failed")
    } finally {
      autofilling = false
    }
  }

  let name = $state(existing?.name ?? "")
  let race = $state(existing?.race ?? "")
  let gender = $state<string>(normalizeGender(existing?.gender ?? "Female", "Female"))
  const genderCustom = $derived(gender !== "Male" && gender !== "Female" ? gender : "")
  function setGenderCustom(val: string) {
    const normalized = normalizeGender(val, "")
    gender = normalized || "Female"
  }
  let generalDescription = $state(existing?.general_description ?? "")
  let baselineAppearance = $state(existing?.baseline_appearance ?? "")
  let currentClothing = $state(existing?.current_clothing ?? "")
  let selectedTraits = $state<string[]>(initialPersonality.selected)
  let customPersonalityInput = $state("")
  let customPersonalityTraits = $state<string[]>(initialPersonality.custom)
  let majorFlawInput = $state("")
  let majorFlaws = $state<string[]>(existing?.major_flaws ?? [])
  let quirkInput = $state("")
  let perkInput = $state("")
  let quirks = $state<string[]>(existing?.quirks ?? [])
  let perks = $state<string[]>(existing?.perks ?? [])
  const totalPersonalityCount = $derived(selectedTraits.length + customPersonalityTraits.length)
  const activeModules: StoryModules = $derived($pendingStoryModules ?? $storyDefaults)
  const traitsEnabled = $derived(activeModules.character_personality_traits)
  const majorFlawsEnabled = $derived(activeModules.character_major_flaws)
  const quirksEnabled = $derived(activeModules.character_quirks)
  const perksEnabled = $derived(activeModules.character_perks)
  const canRegenerateTraits = $derived(traitsEnabled && majorFlawsEnabled && quirksEnabled && perksEnabled)

  function setModules(next: StoryModules) {
    pendingStoryModules.set(next)
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

  const modulesPreviewCore = $derived(
    `Core: ${activeModules.track_npcs ? "NPCs on" : "NPCs off"} · ${
      activeModules.track_locations ? "Locations on" : "Locations off"
    } · Appearance: ${activeModules.character_appearance_clothing ? "on" : "off"}`,
  )
  const modulesPreviewPlayer = $derived(
    `Player fields: ${countEnabled(activeModules, PLAYER_MODULE_KEYS)}/${PLAYER_MODULE_KEYS.length}`,
  )
  const modulesPreviewNpc = $derived(
    activeModules.track_npcs
      ? `NPC fields: ${countEnabled(activeModules, NPC_MODULE_KEYS)}/${NPC_MODULE_KEYS.length}`
      : "NPC fields: — (tracking off)",
  )

  function isBlocked(trait: string): boolean {
    const opp = OPPOSITES[trait]
    return opp != null && selectedTraits.includes(opp)
  }

  function toggleTrait(trait: string) {
    if (selectedTraits.includes(trait)) {
      selectedTraits = selectedTraits.filter((t) => t !== trait)
    } else if (totalPersonalityCount < 5 && !isBlocked(trait)) {
      selectedTraits = [...selectedTraits, trait]
    }
  }

  function addCustomPersonalityTrait() {
    const t = customPersonalityInput.trim()
    if (!t || totalPersonalityCount >= 5) return
    const key = normalizeKey(t)
    const canonical = PERSONALITY_CANONICAL[key]
    if (canonical) {
      if (!selectedTraits.includes(canonical) && !isBlocked(canonical)) {
        selectedTraits = [...selectedTraits, canonical]
      }
      customPersonalityInput = ""
      return
    }
    const existingCustomKeys = new Set(customPersonalityTraits.map(normalizeKey))
    if (!existingCustomKeys.has(key)) {
      customPersonalityTraits = [...customPersonalityTraits, t]
    }
    customPersonalityInput = ""
  }

  function removeCustomPersonalityTrait(t: string) {
    customPersonalityTraits = customPersonalityTraits.filter((x) => x !== t)
  }

  function addQuirk() {
    const t = quirkInput.trim()
    if (t && !quirks.includes(t)) {
      quirks = [...quirks, t]
    }
    quirkInput = ""
  }

  function addMajorFlaw() {
    const t = majorFlawInput.trim()
    if (t && !majorFlaws.includes(t)) {
      majorFlaws = [...majorFlaws, t]
    }
    majorFlawInput = ""
  }

  function removeQuirk(t: string) {
    quirks = quirks.filter((x) => x !== t)
  }

  function removeMajorFlaw(t: string) {
    majorFlaws = majorFlaws.filter((x) => x !== t)
  }

  function addPerk() {
    const t = perkInput.trim()
    if (t && !perks.includes(t)) {
      perks = [...perks, t]
    }
    perkInput = ""
  }

  function usePrompt(value: string) {
    pendingCharacterGenerateDescription.set(value)
  }

  function deletePrompt(value: string) {
    void removePromptHistory(CHARACTER_PROMPT_HISTORY_KEY, value).then((items) => {
      promptHistory = items
    })
  }

  function removePerk(t: string) {
    perks = perks.filter((x) => x !== t)
  }

  function validate() {
    if (!name.trim()) return "Name is required"
    if (!race.trim()) return "Race is required"
    if (!gender.trim()) return "Gender is required"
    if (!generalDescription.trim()) return "Description is required"
    return null
  }

  function buildCharacterContext() {
    const seen = new SvelteSet<string>()
    const uniquePersonality = (traits: string[]) => {
      const out: string[] = []
      for (const raw of traits) {
        const t = raw.trim()
        if (!t) continue
        const key = normalizeKey(t)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(t)
      }
      return out
    }
    const baseline = baselineAppearance.trim() || serverDefaults.unknown.baselineAppearance
    const clothing = currentClothing.trim() || serverDefaults.unknown.clothing
    return {
      name: name.trim(),
      race: race.trim(),
      gender,
      general_description: generalDescription.trim() || serverDefaults.unknown.generalDescription,
      current_location: existing?.current_location ?? serverDefaults.unknown.location,
      baseline_appearance: baseline,
      current_appearance: baseline,
      current_clothing: clothing,
      personality_traits: uniquePersonality([...selectedTraits, ...customPersonalityTraits]).filter((_, i) => i < 5),
      major_flaws: majorFlaws,
      quirks,
      perks,
      custom_fields: existing?.custom_fields ?? {},
    }
  }

  function buildCharacterData() {
    const base = buildCharacterContext()
    return { ...base, current_appearance: "" }
  }

  async function regenerateAppearance() {
    if (regeneratingAppearance) return
    if (!activeModules.character_appearance_clothing) {
      showError("Appearance regeneration is disabled by story modules")
      return
    }
    regeneratingAppearance = true
    const requestId = createRequestId()
    const unsub = $streamingEnabled
      ? subscribeStreamPreview(requestId, (patch) => {
          if (typeof patch.baseline_appearance === "string") baselineAppearance = patch.baseline_appearance
        })
      : null
    try {
      const result = await generateCharacterAppearance(buildCharacterContext(), activeModules, requestId)
      baselineAppearance = result.baseline_appearance
    } catch (err) {
      showError(err instanceof Error ? err.message : "Regeneration failed")
    } finally {
      regeneratingAppearance = false
      unsub?.()
    }
  }

  async function regenerateTraits() {
    if (regeneratingTraits) return
    if (!canRegenerateTraits) {
      showError("Trait regeneration is disabled by story modules")
      return
    }
    regeneratingTraits = true
    try {
      const result = await generateCharacterTraits(buildCharacterContext(), activeModules)
      const split = splitPersonalityTraits(result.personality_traits)
      selectedTraits = split.selected
      customPersonalityTraits = split.custom
      majorFlaws = result.major_flaws
      quirks = result.quirks
      perks = result.perks
    } catch (err) {
      showError(err instanceof Error ? err.message : "Regeneration failed")
    } finally {
      regeneratingTraits = false
    }
  }

  async function regenerateClothing() {
    if (regeneratingClothing) return
    if (!activeModules.character_appearance_clothing) {
      showError("Clothing regeneration is disabled by story modules")
      return
    }
    regeneratingClothing = true
    const requestId = createRequestId()
    const unsub = $streamingEnabled
      ? subscribeStreamPreview(requestId, (patch) => {
          if (typeof patch.current_clothing === "string") currentClothing = patch.current_clothing
        })
      : null
    try {
      const result = await generateCharacterClothing(buildCharacterContext(), activeModules, requestId)
      currentClothing = result.current_clothing
    } catch (err) {
      showError(err instanceof Error ? err.message : "Regeneration failed")
    } finally {
      regeneratingClothing = false
      unsub?.()
    }
  }

  function useNow() {
    const err = validate()
    if (err) {
      showError(err)
      return
    }
    pendingCharacter.set(buildCharacterData())
    pendingCharacterId.set(null)
    navigate("new-story")
  }

  async function saveCharacter() {
    if (savingCharacter) return
    const err = validate()
    if (err) {
      showError(err)
      return
    }
    savingCharacter = true
    try {
      const result = await importCharacter(
        buildCharacterData(),
        $pendingCharacterImportCard,
        $pendingCharacterImportAvatarDataUrl,
      )
      if (result.needs_review) {
        showError("Saved character needs review. Please check the fields and try again.")
        return
      }
      showQuietNotice(`Character "${result.character.name}" saved.`)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save character")
    } finally {
      savingCharacter = false
    }
  }
</script>

<div class="mx-auto flex h-dvh w-full max-w-3xl flex-col">
  <header class="flex items-center gap-2 border-b px-4 py-3">
    <Button variant="ghost" class="h-9 px-2" onclick={() => goBack("home")} aria-label="Back to home">← Back</Button>
    <h2 class="text-base font-semibold">Create Character</h2>
  </header>

  <ScrollArea class="min-h-0 flex-1">
    <div class="px-4 py-4">
      <div class="space-y-4">
        <Card>
          <CardHeader class="space-y-1">
            <CardTitle class="text-base">Generate</CardTitle>
            <CardDescription>Start from a short description, then refine details below.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-3">
            <div class="grid gap-2">
              <Label for="char-generate">Generate from Description</Label>
              <Textarea
                id="char-generate"
                bind:value={$pendingCharacterGenerateDescription}
                placeholder="e.g. a grizzled old sailor who lost his family at sea"
                class="min-h-[96px]"
              />
            </div>

            <div class="flex flex-wrap items-center justify-between gap-2">
              <Button
                variant="default"
                onclick={generate}
                disabled={generating || !$pendingCharacterGenerateDescription.trim()}
              >
                {generating ? "Generating..." : "✦ Generate"}
              </Button>

              {#if $pendingCharacterImportText.trim()}
                <div class="flex items-center gap-2">
                  <span class="text-xs text-muted-foreground">Imported character detected.</span>
                  <Button variant="outline" size="sm" onclick={autofillFromImport} disabled={autofilling}>
                    {autofilling ? "Autofilling..." : "Autofill Missing Fields"}
                  </Button>
                </div>
              {/if}
            </div>

            <PromptHistoryPanel items={promptHistory} onUse={usePrompt} onDelete={deletePrompt} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="space-y-1">
            <CardTitle class="text-base">Basics</CardTitle>
            <CardDescription>These fields are required.</CardDescription>
          </CardHeader>
          <CardContent class="space-y-4">
            <div class="grid gap-2">
              <Label for="char-name">Name</Label>
              <Input id="char-name" type="text" bind:value={name} placeholder="Full legal name" />
            </div>

            <div class="grid gap-4 sm:grid-cols-2">
              <div class="grid gap-2">
                <Label for="char-race">Race</Label>
                <Input id="char-race" type="text" bind:value={race} placeholder="e.g. Human, Elf, Dwarf..." />
              </div>

              <div class="grid gap-2">
                <Label id="gender-label" for="gender-custom">Gender</Label>
                <div class="flex flex-wrap gap-2">
                  {#each ["Male", "Female"] as g (g)}
                    <Button
                      variant="outline"
                      size="sm"
                      class={cn(
                        "flex-1 justify-center",
                        gender === g &&
                          "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
                      )}
                      onclick={() => (gender = g)}
                      aria-pressed={gender === g}
                    >
                      {g}
                    </Button>
                  {/each}
                  <Input
                    id="gender-custom"
                    type="text"
                    placeholder="or specify…"
                    value={genderCustom}
                    class={cn(
                      "min-w-[12ch] flex-[2_1_12ch]",
                      gender !== "Male" && gender !== "Female" && "border-primary/50",
                    )}
                    oninput={(e) => setGenderCustom((e.target as HTMLInputElement).value)}
                  />
                </div>
                <p class="text-xs text-muted-foreground">Pick Male/Female or type a custom value.</p>
              </div>
            </div>

            <div class="grid gap-2">
              <Label for="char-description">Description</Label>
              <Textarea
                id="char-description"
                bind:value={generalDescription}
                placeholder="A few sentences about personality, vibe, and background..."
                class="min-h-[96px]"
              />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader class="flex flex-row items-start justify-between gap-3 space-y-0">
            <div class="space-y-1">
              <CardTitle class="text-base">Story Modules</CardTitle>
              <CardDescription>Controls which fields are generated and tracked.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onclick={() => (showModulesPanel = true)}>Edit</Button>
          </CardHeader>
          <CardContent class="space-y-1 text-sm text-muted-foreground">
            <div class="text-foreground">{modulesPreviewCore}</div>
            <div>{modulesPreviewPlayer}</div>
            <div>{modulesPreviewNpc}</div>
          </CardContent>
        </Card>

        {#if activeModules.character_appearance_clothing}
          <Card>
            <CardHeader class="space-y-1">
              <CardTitle class="text-base">Appearance</CardTitle>
              <CardDescription>Baseline appearance and starting clothing.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="grid gap-2">
                <div class="flex items-center justify-between gap-3">
                  <Label for="char-baseline-appearance">Baseline Appearance</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={regenerateAppearance}
                    disabled={generating || regeneratingAppearance}
                  >
                    {regeneratingAppearance ? "Regenerating..." : "Regenerate"}
                  </Button>
                </div>
                <Textarea
                  id="char-baseline-appearance"
                  bind:value={baselineAppearance}
                  placeholder="Permanent, surgical baseline description..."
                  class="min-h-[96px]"
                />
              </div>

              <div class="grid gap-2">
                <div class="flex items-center justify-between gap-3">
                  <Label for="char-clothing">Starting Clothing</Label>
                  <Button
                    variant="outline"
                    size="sm"
                    onclick={regenerateClothing}
                    disabled={generating || regeneratingClothing}
                  >
                    {regeneratingClothing ? "Regenerating..." : "Regenerate"}
                  </Button>
                </div>
                <Textarea
                  id="char-clothing"
                  bind:value={currentClothing}
                  placeholder="What are they wearing?"
                  class="min-h-[96px]"
                />
              </div>
            </CardContent>
          </Card>
        {/if}

        {#if traitsEnabled}
          <Card>
            <CardHeader class="flex flex-row items-start justify-between gap-3 space-y-0">
              <div class="space-y-1">
                <CardTitle class="text-base">Traits</CardTitle>
                <CardDescription>Pick up to 5 total traits (including custom).</CardDescription>
              </div>
              <Button
                variant="outline"
                size="sm"
                onclick={regenerateTraits}
                disabled={generating || regeneratingTraits || !canRegenerateTraits}
              >
                {regeneratingTraits ? "Regenerating..." : "Regenerate"}
              </Button>
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="flex flex-wrap gap-2">
                {#each PERSONALITY_OPTIONS as trait (trait)}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    class={cn(
                      "h-8 rounded-full px-3 text-xs",
                      selectedTraits.includes(trait) &&
                        "border-primary/50 bg-primary/10 text-primary hover:bg-primary/15",
                      isBlocked(trait) && !selectedTraits.includes(trait) && "opacity-50",
                    )}
                    onclick={() => toggleTrait(trait)}
                    disabled={!selectedTraits.includes(trait) && (totalPersonalityCount >= 5 || isBlocked(trait))}
                    aria-pressed={selectedTraits.includes(trait)}
                  >
                    {trait}
                  </Button>
                {/each}
              </div>

              <div class="grid gap-2">
                <Label for="custom-personality-input">Custom Personality Traits</Label>
                <div class="flex flex-col gap-2 sm:flex-row">
                  <Input
                    id="custom-personality-input"
                    type="text"
                    bind:value={customPersonalityInput}
                    placeholder="e.g. Recklessly brave"
                    disabled={totalPersonalityCount >= 5}
                    onkeydown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault()
                        addCustomPersonalityTrait()
                      }
                    }}
                  />
                  <Button
                    variant="outline"
                    onclick={addCustomPersonalityTrait}
                    disabled={totalPersonalityCount >= 5 || !customPersonalityInput.trim()}
                  >
                    + Add
                  </Button>
                </div>
                <p class="text-xs text-muted-foreground">Optional; counts toward the 5-trait limit.</p>
              </div>

              {#if customPersonalityTraits.length > 0}
                <div class="flex flex-wrap gap-2">
                  {#each customPersonalityTraits as t (t)}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      class="h-8 rounded-full px-3 text-xs"
                      onclick={() => removeCustomPersonalityTrait(t)}
                    >
                      {t} <span class="text-foreground/60">×</span>
                    </Button>
                  {/each}
                </div>
              {/if}
            </CardContent>
          </Card>
        {/if}

        {#if majorFlawsEnabled}
          <Card>
            <CardHeader class="space-y-1">
              <CardTitle class="text-base">Major Flaws</CardTitle>
              <CardDescription>Optional.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="major-flaw-input"
                  type="text"
                  bind:value={majorFlawInput}
                  placeholder="e.g. crippling fear of fire"
                  onkeydown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addMajorFlaw()
                    }
                  }}
                />
                <Button variant="outline" onclick={addMajorFlaw} disabled={!majorFlawInput.trim()}>+ Add</Button>
              </div>
              {#if majorFlaws.length > 0}
                <div class="flex flex-wrap gap-2">
                  {#each majorFlaws as t (t)}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      class="h-8 rounded-full px-3 text-xs"
                      onclick={() => removeMajorFlaw(t)}
                    >
                      {t} <span class="text-foreground/60">×</span>
                    </Button>
                  {/each}
                </div>
              {/if}
            </CardContent>
          </Card>
        {/if}

        {#if quirksEnabled}
          <Card>
            <CardHeader class="space-y-1">
              <CardTitle class="text-base">Quirks</CardTitle>
              <CardDescription>Optional.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="quirk-input"
                  type="text"
                  bind:value={quirkInput}
                  placeholder="e.g. counts exits on entry"
                  onkeydown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addQuirk()
                    }
                  }}
                />
                <Button variant="outline" onclick={addQuirk} disabled={!quirkInput.trim()}>+ Add</Button>
              </div>
              {#if quirks.length > 0}
                <div class="flex flex-wrap gap-2">
                  {#each quirks as t (t)}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      class="h-8 rounded-full px-3 text-xs"
                      onclick={() => removeQuirk(t)}
                    >
                      {t} <span class="text-foreground/60">×</span>
                    </Button>
                  {/each}
                </div>
              {/if}
            </CardContent>
          </Card>
        {/if}

        {#if perksEnabled}
          <Card>
            <CardHeader class="space-y-1">
              <CardTitle class="text-base">Perks</CardTitle>
              <CardDescription>Optional.</CardDescription>
            </CardHeader>
            <CardContent class="space-y-3">
              <div class="flex flex-col gap-2 sm:flex-row">
                <Input
                  id="perk-input"
                  type="text"
                  bind:value={perkInput}
                  placeholder="e.g. trained medic"
                  onkeydown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault()
                      addPerk()
                    }
                  }}
                />
                <Button variant="outline" onclick={addPerk} disabled={!perkInput.trim()}>+ Add</Button>
              </div>
              {#if perks.length > 0}
                <div class="flex flex-wrap gap-2">
                  {#each perks as t (t)}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      class="h-8 rounded-full px-3 text-xs"
                      onclick={() => removePerk(t)}
                    >
                      {t} <span class="text-foreground/60">×</span>
                    </Button>
                  {/each}
                </div>
              {/if}
            </CardContent>
          </Card>
        {/if}
      </div>
    </div>
  </ScrollArea>

  <div class="flex items-center justify-between gap-2 border-t bg-background/70 px-4 py-3 backdrop-blur">
    <Button
      variant="outline"
      onclick={saveCharacter}
      disabled={savingCharacter ||
        generating ||
        autofilling ||
        regeneratingAppearance ||
        regeneratingClothing ||
        regeneratingTraits}
    >
      {savingCharacter ? "Saving..." : "Save Character"}
    </Button>

    <Button
      variant="default"
      onclick={useNow}
      disabled={savingCharacter ||
        generating ||
        autofilling ||
        regeneratingAppearance ||
        regeneratingClothing ||
        regeneratingTraits}
    >
      Use Now →
    </Button>
  </div>
</div>

<Dialog open={showModulesPanel} onOpenChange={(v) => (showModulesPanel = v)}>
  <DialogContent class="max-w-[min(92vw,56rem)]">
    <DialogHeader>
      <DialogTitle>Story Modules</DialogTitle>
    </DialogHeader>
    <div class="mt-3">
      <StoryModulesPanel modules={activeModules} {setModules} bare />
    </div>
  </DialogContent>
</Dialog>
