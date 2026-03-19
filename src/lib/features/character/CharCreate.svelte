<script lang="ts">
  import { untrack } from "svelte"
  import { get } from "svelte/store"
  import { SvelteMap, SvelteSet } from "svelte/reactivity"
  import type { StoryModules } from "@/types/types"
  import {
    storyModulesPreviewCore,
    storyModulesPreviewNpc,
    storyModulesPreviewPlayer,
  } from "@/domain/story/module-definitions"
  import { goBack, navigate } from "@/stores/router"
  import { showError, showQuietNotice } from "@/stores/ui"
  import { cn } from "@/utils.js"
  import type { CustomFieldDef } from "@/types/api"
  import { settings as settingsService } from "@/services/settings"
  import { isCustomFieldModuleEnabled } from "@/domain/story/custom-field-modules"
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
  import personalityOptions from "@/config/traits.json"
  import serverDefaults from "@/config/server-defaults.json"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "@/utils/promptHistory"
  import { normalizeGender } from "@/utils/text"
  import { createRequestId } from "@/utils/ids"
  import { clearPendingRequest, getPendingRequest, setPendingRequest } from "@/utils/pendingRequests"
  import PromptHistoryPanel from "@/components/panels/PromptHistoryPanel.svelte"
  import { subscribeStreamPreview } from "@/services/streamPreview"
  import { pickFile, readFileAsDataUrl } from "@/utils/dom/filePick"
  import StoryModulesPanel from "@/components/panels/StoryModulesPanel.svelte"
  import { Button } from "@/components/ui/button"
  import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
  import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
  import { Input } from "@/components/ui/input"
  import * as InputGroup from "@/components/ui/input-group"
  import { Label } from "@/components/ui/label"
  import * as Avatar from "@/components/ui/avatar"
  import { Textarea } from "@/components/ui/textarea"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import * as ToggleGroup from "@/components/ui/toggle-group"
  import CustomFieldsEditor from "@/components/inputs/CustomFieldsEditor.svelte"
  import {
    generateCharacterFromDescription,
    generateCharacterAppearance,
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

  const PERSONALITY_INDEX = new Map(PERSONALITY_OPTIONS.map((t, i) => [t, i]))

  const TRAIT_GROUPS: Array<{ title: string; pairs: Array<[string, string]> }> = [
    {
      title: "Drive & Motivation",
      pairs: [
        ["Ambitious", "Complacent"],
        ["Passionate", "Apathetic"],
        ["Impulsive", "Deliberate"],
        ["Greedy", "Disciplined"],
      ],
    },
    {
      title: "Mindset & Worldview",
      pairs: [
        ["Curious", "Closed-minded"],
        ["Idealistic", "Cynical"],
        ["Naive", "Clever"],
        ["Rigid", "Adaptable"],
      ],
    },
    {
      title: "Morality & Ethics",
      pairs: [
        ["Honest", "Deceitful"],
        ["Selfish", "Selfless"],
        ["Empathetic", "Cruel"],
        ["Loyal", "Treacherous"],
        ["Forgiving", "Vindictive"],
      ],
    },
    {
      title: "Agency & Courage",
      pairs: [
        ["Courageous", "Cowardly"],
        ["Resourceful", "Helpless"],
        ["Decisive", "Indecisive"],
      ],
    },
    {
      title: "Social Behavior",
      pairs: [
        ["Outgoing", "Reserved"],
        ["Rebellious", "Conformist"],
        ["Domineering", "Submissive"],
      ],
    },
    {
      title: "Trust & Openness",
      pairs: [
        ["Trusting", "Paranoid"],
        ["Transparent", "Secretive"],
      ],
    },
    {
      title: "Self-Perception & Ego",
      pairs: [
        ["Humble", "Arrogant"],
        ["Modest", "Vulgar"],
      ],
    },
    {
      title: "Emotional Expression",
      pairs: [["Vulnerable", "Stoic"]],
    },
  ]

  const existing = get(pendingCharacter)
  const splitPersonalityTraits = (traits: string[]) => {
    const cleaned = traits.map((t) => t.trim()).filter(Boolean)
    const selectedMap = new SvelteMap<string, string>()
    const customMap = new SvelteMap<string, string>()
    for (const raw of cleaned) {
      const key = normalizeKey(raw)
      const canonical = PERSONALITY_CANONICAL[key]
      if (canonical) {
        const opposite = OPPOSITES[canonical]
        if (opposite && selectedMap.has(normalizeKey(opposite))) continue
        if (!selectedMap.has(key)) selectedMap.set(key, canonical)
      } else if (!customMap.has(key)) {
        customMap.set(key, raw)
      }
    }
    const selected = Array.from(selectedMap.values())
    const custom = Array.from(customMap.values())
    return { selected, custom }
  }
  const initialPersonality = splitPersonalityTraits(existing?.personality_traits ?? [])

  let generating = $state(false)
  let savingCharacter = $state(false)
  let autofilling = $state(false)
  let regeneratingAppearance = $state(false)
  let regeneratingTraits = $state(false)
  let showModulesPanel = $state(false)
  let promptHistory = $state<string[]>([])
  let customDefs = $state<CustomFieldDef[]>([])
  let customDefsLoaded = $state(false)
  let customDefsError = $state<string | null>(null)

  async function loadCustomDefs() {
    if (customDefsLoaded) return
    customDefsError = null
    try {
      customDefs = await settingsService.customFields()
    } catch (err) {
      customDefsError = err instanceof Error ? err.message : "Failed to load custom fields."
      customDefs = []
    } finally {
      customDefsLoaded = true
    }
  }

  $effect(() => {
    untrack(() => {
      void loadPromptHistory(CHARACTER_PROMPT_HISTORY_KEY).then((items) => {
        promptHistory = items
      })
      void loadCustomDefs()
      if (!$pendingStoryModules) pendingStoryModules.set($storyDefaults)
      const pending = getPendingRequest<{ prompt: string; modules: StoryModules }>("generate.character")
      if (pending) {
        pendingCharacterGenerateDescription.set(pending.payload.prompt)
        pendingStoryModules.set(pending.payload.modules)
        void runGenerate(pending.payload.prompt, pending.payload.modules, pending.requestId)
      }
    })
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
          }
          if (patch.custom_fields && typeof patch.custom_fields === "object" && !Array.isArray(patch.custom_fields)) {
            customFields = mergeCustomFields(customFields, patch.custom_fields)
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
      }
      if (result.custom_fields) {
        customFields = mergeCustomFields(customFields, result.custom_fields)
      }

      if (traitsEnabled) {
        const split = splitPersonalityTraits(result.personality_traits ?? [])
        selectedTraits = split.selected
        customPersonalityTraits = split.custom
      }
      if (majorFlawsEnabled && result.major_flaws) majorFlaws = result.major_flaws
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

  const avatarSrc = $derived(($pendingCharacterImportAvatarDataUrl ?? "").trim())

  async function loadAvatar() {
    if (generating || savingCharacter || autofilling) return
    try {
      const file = await pickFile({ accept: "image/*" })
      if (!file) return
      const dataUrl = (await readFileAsDataUrl(file)).trim()
      pendingCharacterImportAvatarDataUrl.set(dataUrl || null)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to load avatar")
    }
  }

  function clearAvatar() {
    pendingCharacterImportAvatarDataUrl.set(null)
  }

  const isMissingText = (value: string) => {
    const trimmed = value.trim()
    return !trimmed || /^unknown\b/i.test(trimmed)
  }

  function mergeTraits(existing: string[], incoming: string[]): string[] {
    const seen = new SvelteSet(existing.map(normalizeKey))
    const out = [...existing]
    for (const trait of incoming) {
      const key = normalizeKey(trait)
      if (!key || seen.has(key)) continue
      out.push(trait)
      seen.add(key)
    }
    return out
  }

  function mergeCustomFields(
    base: Record<string, string | string[]> | undefined,
    patch: unknown,
  ): Record<string, string | string[]> {
    const current = base && typeof base === "object" ? base : {}
    if (!patch || typeof patch !== "object" || Array.isArray(patch)) return current
    return { ...current, ...(patch as Record<string, string | string[]>) }
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
        "Focus on race, gender, baseline appearance, personality traits, and perks.",
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
      }
      if (result.custom_fields) {
        customFields = mergeCustomFields(customFields, result.custom_fields)
      }

      if (traitsEnabled) {
        const existingTraits = [...selectedTraits, ...customPersonalityTraits]
        const generatedTraits = result.personality_traits ?? []
        if (existingTraits.length < 2) {
          const split = splitPersonalityTraits(generatedTraits)
          selectedTraits = split.selected
          customPersonalityTraits = split.custom
        } else {
          const merged = mergeTraits(existingTraits, generatedTraits)
          const split = splitPersonalityTraits(merged)
          selectedTraits = split.selected
          customPersonalityTraits = split.custom
        }
      }

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
  let customFields = $state<Record<string, string | string[]>>(existing?.custom_fields ?? {})
  let selectedTraits = $state<string[]>(initialPersonality.selected)
  let customPersonalityInput = $state("")
  let customPersonalityTraits = $state<string[]>(initialPersonality.custom)
  let majorFlawInput = $state("")
  let majorFlaws = $state<string[]>(existing?.major_flaws ?? [])
  let perkInput = $state("")
  let perks = $state<string[]>(existing?.perks ?? [])
  const totalPersonalityCount = $derived(selectedTraits.length + customPersonalityTraits.length)
  const activeModules: StoryModules = $derived($pendingStoryModules ?? $storyDefaults)
  const traitsEnabled = $derived(activeModules.character_personality_traits)
  const majorFlawsEnabled = $derived(activeModules.character_major_flaws)
  const perksEnabled = $derived(activeModules.character_perks)
  const canRegenerateTraits = $derived(traitsEnabled && majorFlawsEnabled && perksEnabled)

  const enabledBaseCustomDefs = $derived.by(() =>
    customDefs
      .filter(
        (d) =>
          d.enabled &&
          d.scope === "character" &&
          d.placement === "base" &&
          isCustomFieldModuleEnabled(activeModules, d.id, "character"),
      )
      .slice()
      .sort((a, b) => {
        const ao = a.sort_order ?? 0
        const bo = b.sort_order ?? 0
        if (ao !== bo) return ao - bo
        return a.label.localeCompare(b.label)
      }),
  )

  const enabledCurrentCustomDefs = $derived.by(() =>
    customDefs.filter(
      (d) =>
        d.enabled &&
        d.scope === "character" &&
        d.placement === "current" &&
        isCustomFieldModuleEnabled(activeModules, d.id, "character"),
    ),
  )

  let hoveredTrait = $state<string | null>(null)

  function byPersonalityIndex(a: string, b: string): number {
    return (PERSONALITY_INDEX.get(a) ?? 9999) - (PERSONALITY_INDEX.get(b) ?? 9999)
  }

  function traitPairValue(a: string, b: string): string[] {
    const out: string[] = []
    if (selectedTraits.includes(a)) out.push(a)
    if (selectedTraits.includes(b)) out.push(b)
    return out
  }

  function setTraitPairValue(a: string, b: string, next: string[]) {
    const prev = traitPairValue(a, b)
    const added = next.filter((t) => !prev.includes(t))
    let chosen = next
    if (chosen.length > 1) {
      const lastAdded = added[added.length - 1] ?? chosen[chosen.length - 1]
      chosen = lastAdded ? [lastAdded] : chosen.slice(0, 1)
    }
    const rest = selectedTraits.filter((t) => t !== a && t !== b)
    selectedTraits = [...rest, ...chosen].slice().sort(byPersonalityIndex)
  }

  function pairTraitClass(trait: string, opposite: string): string {
    const hovered = hoveredTrait === trait
    const linkedHover = hoveredTrait === trait || hoveredTrait === opposite
    const oppositeSelected = selectedTraits.includes(opposite) && !selectedTraits.includes(trait)
    return cn(
      "flex-1 justify-center text-xs",
      oppositeSelected && "text-muted-foreground",
      linkedHover && "ring-1 ring-primary/25 ring-inset",
      hovered && "ring-2 ring-primary/35 ring-inset",
    )
  }

  function setModules(next: StoryModules) {
    pendingStoryModules.set(next)
  }

  const modulesPreviewCore = $derived.by(() => storyModulesPreviewCore(activeModules))
  const modulesPreviewPlayer = $derived.by(() => storyModulesPreviewPlayer(activeModules))
  const modulesPreviewNpc = $derived.by(() => storyModulesPreviewNpc(activeModules))

  function addCustomPersonalityTrait() {
    const t = customPersonalityInput.trim()
    if (!t) return
    const key = normalizeKey(t)
    const canonical = PERSONALITY_CANONICAL[key]
    if (canonical) {
      if (selectedTraits.includes(canonical)) {
        customPersonalityInput = ""
        return
      }
      const opposite = OPPOSITES[canonical]
      if (opposite && selectedTraits.includes(opposite)) {
        selectedTraits = [...selectedTraits.filter((x) => x !== opposite), canonical].slice().sort(byPersonalityIndex)
      } else {
        selectedTraits = [...selectedTraits, canonical].slice().sort(byPersonalityIndex)
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

  function addMajorFlaw() {
    const t = majorFlawInput.trim()
    if (t && !majorFlaws.includes(t)) {
      majorFlaws = [...majorFlaws, t]
    }
    majorFlawInput = ""
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
    const clothing = serverDefaults.unknown.clothing
    return {
      name: name.trim(),
      race: race.trim(),
      gender,
      general_description: generalDescription.trim() || serverDefaults.unknown.generalDescription,
      current_location: serverDefaults.unknown.location,
      current_activity: serverDefaults.unknown.activity,
      baseline_appearance: baseline,
      current_appearance: baseline,
      current_clothing: clothing,
      personality_traits: uniquePersonality([...selectedTraits, ...customPersonalityTraits]),
      major_flaws: majorFlaws,
      perks,
      memories: [],
      custom_fields: customFields,
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
      perks = result.perks
    } catch (err) {
      showError(err instanceof Error ? err.message : "Regeneration failed")
    } finally {
      regeneratingTraits = false
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
            <div class="flex flex-wrap items-center gap-3">
              {#if avatarSrc}
                <Avatar.Root class="size-16 rounded-xl border bg-muted shadow-sm">
                  <Avatar.Image src={avatarSrc} alt="Character avatar" class="object-cover" />
                </Avatar.Root>
              {/if}
              <div class="flex flex-wrap items-center gap-2">
                <Button variant="outline" onclick={loadAvatar} disabled={generating || savingCharacter || autofilling}>
                  {avatarSrc ? "Replace avatar" : "Load avatar"}
                </Button>
                {#if avatarSrc}
                  <Button variant="ghost" onclick={clearAvatar} disabled={generating || savingCharacter || autofilling}>
                    Clear
                  </Button>
                {/if}
              </div>
            </div>

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
                <InputGroup.Root data-disabled={generating ? "true" : undefined}>
                  <InputGroup.Button
                    size="sm"
                    variant={gender === "Male" ? "default" : "ghost"}
                    class={cn("min-w-[7ch] font-semibold", gender !== "Male" && "text-muted-foreground")}
                    onclick={() => (gender = "Male")}
                    aria-pressed={gender === "Male"}
                    disabled={generating}
                  >
                    Male
                  </InputGroup.Button>
                  <InputGroup.Button
                    size="sm"
                    variant={gender === "Female" ? "default" : "ghost"}
                    class={cn("min-w-[7ch] font-semibold", gender !== "Female" && "text-muted-foreground")}
                    onclick={() => (gender = "Female")}
                    aria-pressed={gender === "Female"}
                    disabled={generating}
                  >
                    Female
                  </InputGroup.Button>
                  <InputGroup.Input
                    id="gender-custom"
                    type="text"
                    placeholder="Custom…"
                    value={genderCustom}
                    class={cn(
                      "min-w-[14ch]",
                      gender !== "Male" && gender !== "Female" && "text-foreground font-medium",
                    )}
                    disabled={generating}
                    aria-labelledby="gender-label"
                    oninput={(e) => setGenderCustom((e.target as HTMLInputElement).value)}
                  />
                </InputGroup.Root>
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
              <CardDescription>Baseline appearance. Current appearance/clothing is set per story.</CardDescription>
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
            </CardContent>
          </Card>
        {/if}

        {#if customDefsError}
          <Card>
            <CardHeader class="space-y-1">
              <CardTitle class="text-base">Custom Fields</CardTitle>
              <CardDescription>Base fields are saved with the character.</CardDescription>
            </CardHeader>
            <CardContent>
              <div class="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
                {customDefsError}
              </div>
            </CardContent>
          </Card>
        {:else if enabledBaseCustomDefs.length > 0 || enabledCurrentCustomDefs.length > 0}
          <Card>
            <CardHeader class="space-y-1">
              <CardTitle class="text-base">Custom Fields</CardTitle>
              <CardDescription
                >Base fields are saved with the character. Current fields are set per story.</CardDescription
              >
            </CardHeader>
            <CardContent class="space-y-4">
              <div class="space-y-2">
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base</div>
                <CustomFieldsEditor
                  defs={enabledBaseCustomDefs}
                  values={customFields}
                  setValues={(next) => (customFields = next)}
                  scope="character"
                  placement="base"
                  disabled={generating || savingCharacter || autofilling}
                />
              </div>
              {#if enabledCurrentCustomDefs.length > 0}
                <div class="rounded-md border bg-muted/30 p-3 text-sm text-muted-foreground">
                  Current custom fields are set when starting a new story.
                </div>
              {/if}
            </CardContent>
          </Card>
        {/if}

        {#if traitsEnabled}
          <Card>
            <CardHeader class="flex flex-row items-start justify-between gap-3 space-y-0">
              <div class="space-y-1">
                <CardTitle class="text-base">Traits</CardTitle>
                <CardDescription>Pick opposites and add custom traits.</CardDescription>
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
              <div class="flex items-center justify-between gap-3">
                <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Opposites</div>
                <div class="text-xs font-mono text-muted-foreground">Selected: {totalPersonalityCount}</div>
              </div>

              <div class="space-y-6">
                {#each TRAIT_GROUPS as group (group.title)}
                  <div class="space-y-2">
                    <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {group.title}
                    </div>
                    <div class="grid gap-2 sm:grid-cols-2">
                      {#each group.pairs as pair (pair[0] + "↔" + pair[1])}
                        {@const a = pair[0]}
                        {@const b = pair[1]}
                        <ToggleGroup.Root
                          type="multiple"
                          value={traitPairValue(a, b)}
                          onValueChange={(next) => setTraitPairValue(a, b, next)}
                          variant="outline"
                          size="sm"
                          spacing={0}
                          class="w-full"
                          aria-label={`${a} versus ${b}`}
                        >
                          <ToggleGroup.Item
                            value={a}
                            aria-label={a}
                            class={pairTraitClass(a, b)}
                            onmouseenter={() => (hoveredTrait = a)}
                            onmouseleave={() => (hoveredTrait = null)}
                          >
                            {a}
                          </ToggleGroup.Item>
                          <ToggleGroup.Item
                            value={b}
                            aria-label={b}
                            class={pairTraitClass(b, a)}
                            onmouseenter={() => (hoveredTrait = b)}
                            onmouseleave={() => (hoveredTrait = null)}
                          >
                            {b}
                          </ToggleGroup.Item>
                        </ToggleGroup.Root>
                      {/each}
                    </div>
                  </div>
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
                    disabled={!customPersonalityInput.trim()}
                  >
                    + Add
                  </Button>
                </div>
                <p class="text-xs text-muted-foreground">Optional.</p>
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
      disabled={savingCharacter || generating || autofilling || regeneratingAppearance || regeneratingTraits}
    >
      {savingCharacter ? "Saving..." : "Save Character"}
    </Button>

    <Button
      variant="default"
      onclick={useNow}
      disabled={savingCharacter || generating || autofilling || regeneratingAppearance || regeneratingTraits}
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
    <ScrollArea class="mt-3 max-h-[70dvh]">
      <div class="pr-4">
        <StoryModulesPanel modules={activeModules} {setModules} bare />
      </div>
    </ScrollArea>
  </DialogContent>
</Dialog>
