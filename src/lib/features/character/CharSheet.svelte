<script lang="ts">
  import { SvelteSet } from "svelte/reactivity"
  import { onDestroy } from "svelte"
  import { get } from "svelte/store"
  import { AppError } from "@/errors"
  import { stories } from "@/services/stories"
  import { settings as settingsService } from "@/services/settings"
  import { activeScreen, charSheetCharacterId, closeCharSheet, showCharSheet } from "@/stores/router"
  import { showError, showQuietNotice } from "@/stores/ui"
  import {
    activeStoryCharacterKey,
    character,
    currentStoryId,
    currentStoryModules,
    llmUpdateId,
    npcs,
    type StoryCharacterKey,
  } from "@/stores/game"
  import { INTERNAL_UI_FLASH_MS } from "@/config/internal-timeouts"
  import type { MainCharacterState, NPCState } from "@/types/types"
  import type { CustomFieldDef } from "@/types/api"
  import { cn } from "@/utils.js"
  import { genderIcon, normalizeGender, splitCsv } from "@/utils/text"
  import EditableFieldList from "@/components/inputs/EditableFieldList.svelte"
  import type { EditField } from "@/components/inputs/editableFieldTypes"
  import CustomFieldsEditor from "@/components/inputs/CustomFieldsEditor.svelte"
  import CustomFieldsView from "@/components/inputs/CustomFieldsView.svelte"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import * as Card from "@/components/ui/card"
  import { Input } from "@/components/ui/input"
  import { Sheet, SheetContent } from "@/components/ui/sheet"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import {
    Box,
    Dot,
    Eye,
    EyeOff,
    FileText,
    MapPin,
    Mars,
    Shirt,
    Smile,
    SquarePen,
    Star,
    Transgender,
    Venus,
    VenusAndMars,
  } from "@lucide/svelte"

  let { inline = false, lockKey = null }: { inline?: boolean; lockKey?: StoryCharacterKey | null } = $props()

  const isGameScreen = $derived($activeScreen === "game")
  const canEdit = $derived((inline || isGameScreen) && $currentStoryId !== null)
  const isStoryContext = $derived($currentStoryId !== null)
  const isStoryPanel = $derived(isStoryContext && (inline || isGameScreen))

  let inspectCharacter = $state<MainCharacterState | null>(null)
  let inspectLoading = $state(false)
  let inspectError = $state<string | null>(null)
  let inspectRefresh = $state(0)
  let inspectFetchNonce = 0

  const isInspectMode = $derived(!inline && !isGameScreen && $showCharSheet && $charSheetCharacterId !== null)
  const effectiveKey = $derived.by(() => lockKey ?? (isStoryPanel ? $activeStoryCharacterKey : "player"))

  let editingKey = $state<StoryCharacterKey | null>(null)

  const selectedStoryCharacter = $derived.by(() => {
    if (!isStoryPanel) return null
    if (!$character) return null
    const key = effectiveKey
    if (key === "player") return { kind: "player" as const, character: $character }
    const name = key.slice("npc:".length)
    const npc = $npcs.find((n) => n.name === name)
    return npc ? { kind: "npc" as const, character: npc } : { kind: "player" as const, character: $character }
  })

  const displayCharacter = $derived.by(() => {
    if (isInspectMode) return inspectCharacter ? { ...inspectCharacter, current_appearance: "" } : null
    if (!isStoryPanel) return null
    return selectedStoryCharacter?.character ?? null
  })

  $effect(() => {
    if (!isStoryPanel) return
    if (lockKey) return
    const key = effectiveKey
    if (key === "player") return
    const name = key.slice("npc:".length)
    if ($npcs.some((npc) => npc.name === name)) return
    activeStoryCharacterKey.set("player")
  })

  $effect(() => {
    if (!editing || !editingKey) return
    if (effectiveKey === editingKey) return
    editing = false
    editingKey = null
  })

  function retryInspect() {
    inspectRefresh += 1
  }

  type CharacterSigs = {
    identity: string
    generalDescription: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    location: string
    activity: string
    inventory: string
    customFields: string
  }

  let lastSigs: CharacterSigs | null = null
  let lastLlmUpdateId = 0
  let flashIdentity = $state(false)
  let flashAppearance = $state(false)
  let flashClothing = $state(false)
  let flashInventory = $state(false)
  let flashCustom = $state(false)
  let identityTimer: number | null = null
  let appearanceTimer: number | null = null
  let clothingTimer: number | null = null
  let inventoryTimer: number | null = null
  let customTimer: number | null = null
  let editing = $state(false)
  let saving = $state(false)
  let showBaselineDetails = $state(false)
  const useAppearance = $derived(
    ($currentStoryModules?.character_appearance_clothing ?? true) ||
      ($currentStoryModules?.npc_appearance_clothing ?? true),
  )
  const usePersonalityTraits = $derived(
    ($currentStoryModules?.character_personality_traits ?? true) ||
      ($currentStoryModules?.npc_personality_traits ?? true),
  )
  const useMajorFlaws = $derived(
    ($currentStoryModules?.character_major_flaws ?? true) || ($currentStoryModules?.npc_major_flaws ?? true),
  )
  const usePerks = $derived(
    ($currentStoryModules?.character_perks ?? true) || ($currentStoryModules?.npc_perks ?? true),
  )
  const useInventory = $derived($currentStoryModules?.character_inventory ?? true)
  const useLocation = $derived($currentStoryModules?.npc_location ?? true)
  const useActivity = $derived($currentStoryModules?.npc_activity ?? true)
  const useMemories = $derived.by(() => {
    if (!selectedStoryCharacter) return $currentStoryModules?.character_memories ?? true
    return selectedStoryCharacter.kind === "player"
      ? ($currentStoryModules?.character_memories ?? true)
      : ($currentStoryModules?.npc_memories ?? true)
  })
  const showTraitSection = $derived(usePersonalityTraits || useMajorFlaws || usePerks)

  type InventoryDraft = { name: string; description: string }
  type CharacterDraft = {
    name: string
    race: string
    gender: string
    generalDescription: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    location: string
    activity: string
    personalityTraits: string
    majorFlaws: string
    perks: string
    memories: string
    inventory: InventoryDraft[]
    customFields: Record<string, string | string[]>
  }
  let draft = $state<CharacterDraft>({
    name: "",
    race: "",
    gender: "",
    generalDescription: "",
    baselineAppearance: "",
    currentAppearance: "",
    clothing: "",
    location: "",
    activity: "",
    personalityTraits: "",
    majorFlaws: "",
    perks: "",
    memories: "",
    inventory: [],
    customFields: {},
  })

  let customDefs = $state<CustomFieldDef[]>([])
  let customDefsLoaded = $state(false)

  const customCharDefs = $derived(customDefs.filter((d) => d.enabled && d.scope === "character"))
  const hasBaseCustomDefs = $derived(customCharDefs.some((d) => d.placement === "base"))
  const hasCurrentCustomDefs = $derived(customCharDefs.some((d) => d.placement === "current"))

  async function loadCustomDefsOnce() {
    if (customDefsLoaded) return
    try {
      customDefs = await settingsService.customFields()
      customDefsLoaded = true
    } catch (err) {
      console.warn("[custom-fields] Failed to load defs", err)
      customDefsLoaded = true
      customDefs = []
    }
  }

  $effect(() => {
    if (!displayCharacter) return
    void loadCustomDefsOnce()
  })

  function buildCharacterSigs(c: MainCharacterState | NPCState): CharacterSigs {
    return {
      identity: `${c.name}|${c.race}|${c.gender}`,
      generalDescription: c.general_description.trim(),
      baselineAppearance: c.baseline_appearance,
      currentAppearance: c.current_appearance,
      clothing: c.current_clothing,
      location: c.current_location,
      activity: "current_activity" in c ? c.current_activity : "",
      inventory: c.inventory.map((item) => `${item.name}:${item.description}`).join("|"),
      customFields: JSON.stringify(c.custom_fields ?? {}),
    }
  }

  function triggerFlash(kind: "identity" | "appearance" | "clothing" | "inventory") {
    const flashMs = INTERNAL_UI_FLASH_MS
    if (kind === "identity") {
      flashIdentity = true
      if (identityTimer) window.clearTimeout(identityTimer)
      identityTimer = window.setTimeout(() => (flashIdentity = false), flashMs)
      return
    }
    if (kind === "appearance") {
      flashAppearance = true
      if (appearanceTimer) window.clearTimeout(appearanceTimer)
      appearanceTimer = window.setTimeout(() => (flashAppearance = false), flashMs)
      return
    }
    if (kind === "clothing") {
      flashClothing = true
      if (clothingTimer) window.clearTimeout(clothingTimer)
      clothingTimer = window.setTimeout(() => (flashClothing = false), flashMs)
      return
    }
    flashInventory = true
    if (inventoryTimer) window.clearTimeout(inventoryTimer)
    inventoryTimer = window.setTimeout(() => (flashInventory = false), flashMs)
  }

  function triggerCustomFlash() {
    const flashMs = INTERNAL_UI_FLASH_MS
    flashCustom = true
    if (customTimer) window.clearTimeout(customTimer)
    customTimer = window.setTimeout(() => (flashCustom = false), flashMs)
  }

  function characterFields(): EditField[] {
    const fields: EditField[] = [
      { id: "cs-name", label: "Name", kind: "input", value: draft.name, onInput: (v) => (draft.name = v) },
      { id: "cs-race", label: "Race", kind: "input", value: draft.race, onInput: (v) => (draft.race = v) },
      { id: "cs-gender", label: "Gender", kind: "input", value: draft.gender, onInput: (v) => (draft.gender = v) },
    ]

    if (isStoryContext && useLocation) {
      fields.push({
        id: "cs-location",
        label: "Current Location",
        kind: "input",
        value: draft.location,
        onInput: (v) => (draft.location = v),
      })
    }

    if (isStoryContext && useActivity && selectedStoryCharacter?.kind === "npc") {
      fields.push({
        id: "cs-activity",
        label: "Current Activity",
        kind: "input",
        value: draft.activity,
        onInput: (v) => (draft.activity = v),
      })
    }

    fields.push({
      id: "cs-description",
      label: "Description",
      kind: "textarea",
      value: draft.generalDescription,
      onInput: (v) => (draft.generalDescription = v),
    })

    if (useAppearance) {
      fields.push({
        id: "cs-baseline-appearance",
        label: "Baseline Appearance",
        kind: "textarea",
        value: draft.baselineAppearance,
        onInput: (v) => (draft.baselineAppearance = v),
      })
      if (isStoryContext) {
        fields.push({
          id: "cs-current-appearance",
          label: "Current Appearance",
          kind: "textarea",
          value: draft.currentAppearance,
          onInput: (v) => (draft.currentAppearance = v),
        })
      }
      fields.push({
        id: "cs-clothing",
        label: "Wearing",
        kind: "textarea",
        value: draft.clothing,
        onInput: (v) => (draft.clothing = v),
      })
    }
    if (usePersonalityTraits) {
      fields.push({
        id: "cs-personality",
        label: "Personality Traits (comma separated)",
        kind: "input",
        value: draft.personalityTraits,
        onInput: (v) => (draft.personalityTraits = v),
      })
    }
    if (useMajorFlaws) {
      fields.push({
        id: "cs-major-flaws",
        label: "Major Flaws (comma separated)",
        kind: "input",
        value: draft.majorFlaws,
        onInput: (v) => (draft.majorFlaws = v),
      })
    }
    if (usePerks) {
      fields.push({
        id: "cs-perks",
        label: "Perks (comma separated)",
        kind: "input",
        value: draft.perks,
        onInput: (v) => (draft.perks = v),
      })
    }
    if (isStoryContext && useMemories) {
      fields.push({
        id: "cs-memories",
        label: "Memories (one per line)",
        kind: "textarea",
        value: draft.memories,
        onInput: (v) => (draft.memories = v),
      })
    }
    return fields
  }

  function splitUniqueLines(value: string): string[] {
    const seen = new SvelteSet<string>()
    const out: string[] = []
    for (const raw of value.split("\n")) {
      const trimmed = raw.trim()
      if (!trimmed) continue
      const key = trimmed.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(trimmed)
    }
    return out
  }

  function startEdit() {
    if (!canEdit) return
    const current = selectedStoryCharacter?.character
    if (!current) return
    void loadCustomDefsOnce()
    draft = {
      name: current.name,
      race: current.race,
      gender: current.gender,
      generalDescription: current.general_description ?? "",
      baselineAppearance: current.baseline_appearance,
      currentAppearance: current.current_appearance,
      clothing: current.current_clothing,
      location: current.current_location ?? "",
      activity: "current_activity" in current ? current.current_activity : "",
      personalityTraits: current.personality_traits.join(", "),
      majorFlaws: current.major_flaws.join(", "),
      perks: current.perks.join(", "),
      memories: current.memories.join("\n"),
      inventory: current.inventory.map((item) => ({ name: item.name, description: item.description })),
      customFields: { ...(current.custom_fields ?? {}) },
    }
    editing = true
    editingKey = effectiveKey
  }

  function cancelEdit() {
    editing = false
    editingKey = null
  }

  function addInventoryItem() {
    draft.inventory = [...draft.inventory, { name: "", description: "" }]
  }

  function updateInventoryItem(index: number, key: "name" | "description", value: string) {
    draft.inventory = draft.inventory.map((item, i) => (i === index ? { ...item, [key]: value } : item))
  }

  function removeInventoryItem(index: number) {
    draft.inventory = draft.inventory.filter((_, i) => i !== index)
  }

  async function saveCharacter() {
    if (!$currentStoryId) {
      showError("No active story to update.")
      return
    }
    if (!selectedStoryCharacter) {
      showError("No active character to update.")
      return
    }
    const name = draft.name.trim()
    const race = draft.race.trim()
    const gender = normalizeGender(draft.gender, "")
    const generalDescription = draft.generalDescription.trim()
    const baselineAppearance = draft.baselineAppearance.trim()
    const currentAppearance = draft.currentAppearance.trim()
    const clothing = draft.clothing.trim()
    const location = draft.location.trim()
    const activity = draft.activity.trim()
    if (!name || !race || !gender) {
      showError("Name, race, and gender are required.")
      return
    }
    if (!generalDescription) {
      showError("Description is required.")
      return
    }
    const existing = selectedStoryCharacter.character
    const personalityTraits = usePersonalityTraits
      ? splitCsv(draft.personalityTraits)
      : (existing.personality_traits ?? [])
    const majorFlaws = useMajorFlaws ? splitCsv(draft.majorFlaws) : (existing.major_flaws ?? [])
    const perks = usePerks ? splitCsv(draft.perks) : (existing.perks ?? [])
    const memories = useMemories ? splitUniqueLines(draft.memories) : (existing.memories ?? [])
    const inventory = useInventory
      ? draft.inventory
          .map((item) => ({ name: item.name.trim(), description: item.description.trim() }))
          .filter((item) => item.name.length > 0 || item.description.length > 0)
      : (existing.inventory ?? [])
    if (useInventory) {
      for (const item of inventory) {
        if (!item.name || !item.description) {
          showError("Inventory items need both a name and description.")
          return
        }
      }
    }

    if (selectedStoryCharacter.kind === "player") {
      const existing = selectedStoryCharacter.character
      const nextCharacter: MainCharacterState = {
        name,
        race,
        gender,
        general_description: generalDescription,
        current_location: useLocation ? location || existing.current_location || "" : (existing.current_location ?? ""),
        current_activity: existing.current_activity ?? "",
        baseline_appearance: !useAppearance
          ? (existing.baseline_appearance ?? "")
          : baselineAppearance || existing.baseline_appearance || "",
        current_appearance: !useAppearance
          ? (existing.current_appearance ?? "")
          : currentAppearance ||
            existing.current_appearance ||
            baselineAppearance ||
            existing.baseline_appearance ||
            "",
        current_clothing: !useAppearance
          ? (existing.current_clothing ?? "")
          : clothing || existing.current_clothing || "",
        personality_traits: personalityTraits.length > 0 ? personalityTraits : (existing.personality_traits ?? []),
        major_flaws: majorFlaws.length > 0 ? majorFlaws : (existing.major_flaws ?? []),
        perks: perks.length > 0 ? perks : (existing.perks ?? []),
        memories,
        inventory,
        custom_fields: draft.customFields ?? existing.custom_fields ?? {},
      }
      saving = true
      try {
        const result = await stories.updateState($currentStoryId, { character: nextCharacter })
        character.set(result.character)
        if (!lockKey) activeStoryCharacterKey.set("player")
        showQuietNotice("Character updated.")
        editing = false
        editingKey = null
      } catch (err) {
        if (err instanceof AppError) {
          showError(err.message)
        } else {
          showError("Failed to update character.")
        }
      } finally {
        saving = false
      }
      return
    }

    const existingNpc = selectedStoryCharacter.character
    const previousName = existingNpc.name
    if (previousName.toLowerCase() !== name.toLowerCase()) {
      if ($npcs.some((npc) => npc.name.toLowerCase() === name.toLowerCase() && npc.name !== previousName)) {
        showError(`Character "${name}" already exists.`)
        return
      }
      if ($character?.name.toLowerCase() === name.toLowerCase()) {
        showError(`Character "${name}" already exists.`)
        return
      }
    }

    const updatedNpc: NPCState = {
      name,
      race,
      gender,
      general_description: generalDescription,
      current_location: useLocation
        ? location || existingNpc.current_location || ""
        : (existingNpc.current_location ?? ""),
      baseline_appearance: !useAppearance
        ? (existingNpc.baseline_appearance ?? "")
        : baselineAppearance || existingNpc.baseline_appearance || "",
      current_appearance: !useAppearance
        ? (existingNpc.current_appearance ?? "")
        : currentAppearance ||
          existingNpc.current_appearance ||
          baselineAppearance ||
          existingNpc.baseline_appearance ||
          "",
      current_clothing: !useAppearance
        ? (existingNpc.current_clothing ?? "")
        : clothing || existingNpc.current_clothing || "",
      current_activity: useActivity
        ? activity || existingNpc.current_activity || ""
        : (existingNpc.current_activity ?? ""),
      personality_traits: personalityTraits.length > 0 ? personalityTraits : (existingNpc.personality_traits ?? []),
      major_flaws: majorFlaws.length > 0 ? majorFlaws : (existingNpc.major_flaws ?? []),
      perks: perks.length > 0 ? perks : (existingNpc.perks ?? []),
      memories,
      inventory,
      custom_fields: draft.customFields ?? existingNpc.custom_fields ?? {},
    }

    saving = true
    try {
      const updatedList = $npcs.map((npc) => (npc.name === previousName ? updatedNpc : npc))
      const result = await stories.updateState($currentStoryId, { npcs: updatedList })
      npcs.set(result.npcs)
      if (!lockKey) activeStoryCharacterKey.set(`npc:${updatedNpc.name}`)
      showQuietNotice("Character updated.")
      editing = false
      editingKey = null
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Failed to update character.")
      }
    } finally {
      saving = false
    }
  }

  $effect(() => {
    void $currentStoryId
    lastSigs = null
    lastLlmUpdateId = get(llmUpdateId)
  })

  $effect(() => {
    if (!isStoryPanel) return
    void effectiveKey
    lastSigs = null
    lastLlmUpdateId = get(llmUpdateId)
  })

  $effect(() => {
    if (!isStoryPanel) return
    if (lastSigs) return
    if (!selectedStoryCharacter?.character) return
    lastSigs = buildCharacterSigs(selectedStoryCharacter.character)
  })

  $effect(() => {
    if (!isInspectMode) {
      inspectCharacter = null
      inspectLoading = false
      inspectError = null
      return
    }
    const id = $charSheetCharacterId
    if (!id) return
    void inspectRefresh
    const nonce = ++inspectFetchNonce
    inspectLoading = true
    inspectError = null
    inspectCharacter = null
    ;(async () => {
      try {
        const result = await stories.getCharacter(id)
        if (nonce !== inspectFetchNonce) return
        inspectCharacter = result
      } catch (err) {
        if (nonce !== inspectFetchNonce) return
        if (err instanceof AppError) {
          inspectError = err.message
        } else {
          inspectError = "Failed to load character."
        }
      } finally {
        if (nonce !== inspectFetchNonce) return
        inspectLoading = false
      }
    })()
  })

  $effect(() => {
    if ($llmUpdateId !== lastLlmUpdateId) {
      const current = selectedStoryCharacter?.character
      if (current) {
        const nextSigs = buildCharacterSigs(current)
        if (lastSigs) {
          if (nextSigs.identity !== lastSigs.identity) triggerFlash("identity")
          if (nextSigs.generalDescription !== lastSigs.generalDescription) triggerFlash("appearance")
          if (useLocation && nextSigs.location !== lastSigs.location) triggerFlash("identity")
          if (useActivity && nextSigs.activity !== lastSigs.activity) triggerFlash("identity")
          if (
            useAppearance &&
            (nextSigs.baselineAppearance !== lastSigs.baselineAppearance ||
              nextSigs.currentAppearance !== lastSigs.currentAppearance)
          ) {
            triggerFlash("appearance")
          }
          if (useAppearance && nextSigs.clothing !== lastSigs.clothing) triggerFlash("clothing")
          if (useInventory && nextSigs.inventory !== lastSigs.inventory) triggerFlash("inventory")
          if (nextSigs.customFields !== lastSigs.customFields) triggerCustomFlash()
        }
        lastSigs = nextSigs
      } else {
        lastSigs = null
      }
      lastLlmUpdateId = $llmUpdateId
    }
  })

  $effect(() => {
    if (!inline && !$showCharSheet && editing) {
      editing = false
    }
  })

  onDestroy(() => {
    if (identityTimer) window.clearTimeout(identityTimer)
    if (appearanceTimer) window.clearTimeout(appearanceTimer)
    if (clothingTimer) window.clearTimeout(clothingTimer)
    if (inventoryTimer) window.clearTimeout(inventoryTimer)
    if (customTimer) window.clearTimeout(customTimer)
  })
</script>

{#snippet charContent()}
  {#if displayCharacter}
    {#if editing}
      <div class="space-y-4">
        <EditableFieldList fields={characterFields()} />
        {#if hasBaseCustomDefs || hasCurrentCustomDefs}
          <Card.Root class="rounded-lg p-0 py-0 gap-0">
            <Card.Header class="px-4 pt-4 pb-3">
              <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <FileText size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
                <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Custom Fields
                </Card.Title>
              </div>
            </Card.Header>
            <Card.Content class="px-4 pb-4 pt-0 space-y-3">
              {#if hasBaseCustomDefs}
                <div class="space-y-2">
                  <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base</div>
                  <CustomFieldsEditor
                    defs={customDefs}
                    values={draft.customFields}
                    setValues={(next) => (draft.customFields = next)}
                    scope="character"
                    placement="base"
                    disabled={saving}
                  />
                </div>
              {/if}
              {#if hasCurrentCustomDefs}
                <div class="space-y-2">
                  <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current</div>
                  <CustomFieldsEditor
                    defs={customDefs}
                    values={draft.customFields}
                    setValues={(next) => (draft.customFields = next)}
                    scope="character"
                    placement="current"
                    disabled={saving}
                  />
                </div>
              {/if}
            </Card.Content>
          </Card.Root>
        {/if}
        {#if useInventory}
          <div class="space-y-2">
            <div class="flex items-center justify-between gap-3">
              <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Inventory</div>
              <Button variant="outline" size="sm" class="h-8" onclick={addInventoryItem} disabled={saving}
                >Add Item</Button
              >
            </div>
            {#if draft.inventory.length === 0}
              <div class="text-sm text-muted-foreground">No items yet.</div>
            {:else}
              {#each draft.inventory as item, index (index)}
                <div class="grid grid-cols-[1fr_1.3fr_auto] items-center gap-2">
                  <Input
                    type="text"
                    value={item.name}
                    placeholder="Item name"
                    oninput={(e) => updateInventoryItem(index, "name", (e.target as HTMLInputElement).value)}
                  />
                  <Input
                    type="text"
                    value={item.description}
                    placeholder="Description"
                    oninput={(e) => updateInventoryItem(index, "description", (e.target as HTMLInputElement).value)}
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    class="h-9 w-9 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    onclick={() => removeInventoryItem(index)}
                    aria-label="Remove item"
                  >
                    ×
                  </Button>
                </div>
              {/each}
            {/if}
          </div>
        {/if}
        <div class="flex items-center justify-end gap-2">
          <Button variant="outline" onclick={cancelEdit} disabled={saving}>Cancel</Button>
          <Button onclick={saveCharacter} disabled={saving || !$currentStoryId}>
            {saving ? "Saving..." : "Save"}
          </Button>
        </div>
      </div>
    {:else}
      <Card.Root class={cn("rounded-lg p-0 py-0 gap-0", flashIdentity && "ring-2 ring-primary/30")}>
        <Card.Header class="px-4 py-4">
          <Card.Title class="flex items-center gap-2 text-lg font-semibold text-foreground">
            <span class="truncate">{displayCharacter.name}</span>
            {#if genderIcon(displayCharacter.gender) === "male"}
              <Mars size={14} strokeWidth={2} class="shrink-0 opacity-60" aria-hidden="true" />
            {:else if genderIcon(displayCharacter.gender) === "female"}
              <Venus size={14} strokeWidth={2} class="shrink-0 opacity-60" aria-hidden="true" />
            {:else if genderIcon(displayCharacter.gender) === "intersex"}
              <VenusAndMars size={14} strokeWidth={2} class="shrink-0 opacity-60" aria-hidden="true" />
            {:else if genderIcon(displayCharacter.gender) === "transgender"}
              <Transgender size={14} strokeWidth={2} class="shrink-0 opacity-60" aria-hidden="true" />
            {/if}
          </Card.Title>
          <Card.Description class="mt-1 text-sm italic text-muted-foreground">
            {displayCharacter.race}{displayCharacter.gender ? ` · ${displayCharacter.gender}` : ""}
          </Card.Description>
        </Card.Header>
      </Card.Root>

      {#if isStoryContext && (useLocation || (useActivity && "current_activity" in displayCharacter))}
        <Card.Root class="mt-3 rounded-lg p-0 py-0 gap-0">
          <Card.Header class="px-4 pt-4 pb-0">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <MapPin size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
              <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >Status</Card.Title
              >
            </div>
          </Card.Header>
          <Card.Content class="px-4 pb-4 pt-0">
            <div class="mt-2 space-y-1 text-sm text-foreground">
              {#if useLocation}
                <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Location</span>
                  <span class="whitespace-pre-line">{displayCharacter.current_location}</span>
                </div>
              {/if}
              {#if useActivity && "current_activity" in displayCharacter}
                <div class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Activity</span>
                  <span class="whitespace-pre-line">{displayCharacter.current_activity}</span>
                </div>
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      {/if}

      {#if showBaselineDetails}
        <Card.Root class={cn("mt-3 rounded-lg p-0 py-0 gap-0", flashAppearance && "ring-2 ring-primary/30")}>
          <Card.Header class="px-4 pt-4 pb-0">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Smile size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
              <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >Description</Card.Title
              >
            </div>
          </Card.Header>
          <Card.Content class="px-4 pb-4 pt-0">
            <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {displayCharacter.general_description || "Unknown description"}
            </div>
          </Card.Content>
        </Card.Root>
      {/if}

      {#if useAppearance}
        {#if showBaselineDetails}
          <Card.Root class={cn("mt-3 rounded-lg p-0 py-0 gap-0", flashAppearance && "ring-2 ring-primary/30")}>
            <Card.Header class="px-4 pt-4 pb-0">
              <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Smile size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
                <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Baseline Appearance
                </Card.Title>
              </div>
            </Card.Header>
            <Card.Content class="px-4 pb-4 pt-0">
              <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {displayCharacter.baseline_appearance}
              </div>
            </Card.Content>
          </Card.Root>
        {:else if !isStoryContext}
          <Card.Root class={cn("mt-3 rounded-lg p-0 py-0 gap-0", flashAppearance && "ring-2 ring-primary/30")}>
            <Card.Header class="px-4 pt-4 pb-0">
              <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Smile size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
                <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                  >Appearance</Card.Title
                >
              </div>
            </Card.Header>
            <Card.Content class="px-4 pb-4 pt-0">
              <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {displayCharacter.baseline_appearance}
              </div>
            </Card.Content>
          </Card.Root>
        {/if}

        {#if isStoryContext}
          <Card.Root class={cn("mt-3 rounded-lg p-0 py-0 gap-0", flashAppearance && "ring-2 ring-primary/30")}>
            <Card.Header class="px-4 pt-4 pb-0">
              <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <Smile size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
                <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Current Appearance
                </Card.Title>
              </div>
            </Card.Header>
            <Card.Content class="px-4 pb-4 pt-0">
              <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
                {displayCharacter.current_appearance}
              </div>
            </Card.Content>
          </Card.Root>
        {/if}

        <Card.Root class={cn("mt-3 rounded-lg p-0 py-0 gap-0", flashClothing && "ring-2 ring-primary/30")}>
          <Card.Header class="px-4 pt-4 pb-0">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Shirt size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
              <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground"
                >Wearing</Card.Title
              >
            </div>
          </Card.Header>
          <Card.Content class="px-4 pb-4 pt-0">
            <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {displayCharacter.current_clothing}
            </div>
          </Card.Content>
        </Card.Root>
      {/if}

      {#if showTraitSection && ((usePersonalityTraits && displayCharacter.personality_traits.length > 0) || (useMajorFlaws && displayCharacter.major_flaws.length > 0) || (usePerks && displayCharacter.perks.length > 0))}
        <Card.Root class="mt-3 rounded-lg p-0 py-0 gap-0">
          <Card.Header class="px-4 pt-4 pb-0">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Star size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
              <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Traits · Flaws · Perks
              </Card.Title>
            </div>
          </Card.Header>
          <Card.Content class="px-4 pb-4 pt-0">
            <div class="mt-3 flex flex-wrap gap-2">
              {#if usePersonalityTraits}
                {#each displayCharacter.personality_traits as t, index (t + ":" + index)}
                  <Badge variant="outline" class="rounded-full font-mono text-[11px]">{t}</Badge>
                {/each}
              {/if}
              {#if useMajorFlaws}
                {#each displayCharacter.major_flaws as t, index (t + ":" + index)}
                  <Badge variant="outline" class="rounded-full font-mono text-[11px]">{t}</Badge>
                {/each}
              {/if}
              {#if usePerks}
                {#each displayCharacter.perks as t, index (t + ":" + index)}
                  <Badge variant="outline" class="rounded-full font-mono text-[11px]">{t}</Badge>
                {/each}
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      {/if}

      {#if customCharDefs.length > 0}
        <Card.Root class={cn("mt-3 rounded-lg p-0 py-0 gap-0", flashCustom && "ring-2 ring-primary/30")}>
          <Card.Header class="px-4 pt-4 pb-0">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
              <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Custom Fields
              </Card.Title>
            </div>
          </Card.Header>
          <Card.Content class="px-4 pb-4 pt-0">
            <div class="mt-3 space-y-4">
              {#if hasBaseCustomDefs}
                <div class="space-y-2">
                  <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Base</div>
                  <CustomFieldsView
                    defs={customDefs}
                    values={displayCharacter.custom_fields}
                    scope="character"
                    placement="base"
                  />
                </div>
              {/if}
              {#if hasCurrentCustomDefs}
                <div class="space-y-2">
                  <div class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Current</div>
                  <CustomFieldsView
                    defs={customDefs}
                    values={displayCharacter.custom_fields}
                    scope="character"
                    placement="current"
                  />
                </div>
              {/if}
            </div>
          </Card.Content>
        </Card.Root>
      {/if}

      {#if isStoryContext && useMemories}
        <Card.Root class="mt-3 rounded-lg p-0 py-0 gap-0">
          <Card.Header class="px-4 pt-4 pb-0">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <FileText size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
              <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Memories ({displayCharacter.memories.length})
              </Card.Title>
            </div>
          </Card.Header>
          <Card.Content class="px-4 pb-4 pt-0">
            {#if displayCharacter.memories.length === 0}
              <div class="mt-2 text-sm italic text-muted-foreground">No memories yet.</div>
            {:else}
              <ul class="mt-3 space-y-2">
                {#each displayCharacter.memories as memory, index (memory + ":" + index)}
                  <li class="flex items-start gap-2">
                    <Dot size={12} strokeWidth={1.5} class="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div class="min-w-0 text-sm text-foreground">{memory}</div>
                  </li>
                {/each}
              </ul>
            {/if}
          </Card.Content>
        </Card.Root>
      {/if}

      {#if useInventory}
        <Card.Root class={cn("mt-3 rounded-lg p-0 py-0 gap-0", flashInventory && "ring-2 ring-primary/30")}>
          <Card.Header class="px-4 pt-4 pb-0">
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <Box size={14} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
              <Card.Title class="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Inventory ({displayCharacter.inventory.length})
              </Card.Title>
            </div>
          </Card.Header>
          <Card.Content class="px-4 pb-4 pt-0">
            {#if displayCharacter.inventory.length === 0}
              <div class="mt-2 text-sm italic text-muted-foreground">Nothing</div>
            {:else}
              <ul class="mt-3 space-y-2">
                {#each displayCharacter.inventory as item, index (index)}
                  <li class="flex items-start gap-2">
                    <Dot size={12} strokeWidth={1.5} class="mt-1 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div class="min-w-0">
                      <div class="text-sm font-medium text-foreground">{item.name}</div>
                      <div class="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
                    </div>
                  </li>
                {/each}
              </ul>
            {/if}
          </Card.Content>
        </Card.Root>
      {/if}
    {/if}
  {:else}
    <div class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">
      No active character
    </div>
  {/if}
{/snippet}

{#if inline}
  <div class="flex h-dvh flex-col overflow-hidden border-r bg-card">
    <div class="flex items-center justify-between gap-3 border-b px-4 py-3">
      <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        <FileText size={16} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
        <span>Player</span>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          onclick={() => (showBaselineDetails = !showBaselineDetails)}
          disabled={!displayCharacter}
          title={showBaselineDetails ? "Hide details" : "Show details"}
          aria-label={showBaselineDetails ? "Hide details" : "Show details"}
        >
          {#if showBaselineDetails}
            <EyeOff size={12} strokeWidth={2} aria-hidden="true" />
          {:else}
            <Eye size={12} strokeWidth={2} aria-hidden="true" />
          {/if}
        </Button>
        <Button
          variant="outline"
          size="icon"
          class="h-8 w-8"
          onclick={startEdit}
          disabled={editing || !canEdit || !displayCharacter || saving}
          title="Edit character sheet"
          aria-label="Edit character sheet"
        >
          <SquarePen size={12} strokeWidth={2} aria-hidden="true" />
        </Button>
      </div>
    </div>
    <ScrollArea class="min-h-0 flex-1">
      <div class="p-4">
        {@render charContent()}
      </div>
    </ScrollArea>
  </div>
{:else}
  <Sheet
    open={$showCharSheet}
    onOpenChange={(next) => {
      if (!next && $showCharSheet) closeCharSheet()
    }}
  >
    <SheetContent side="right" class="p-0">
      <div class="flex items-center justify-between gap-3 border-b px-4 py-3">
        <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          <FileText size={16} strokeWidth={1.5} class="shrink-0 opacity-70" aria-hidden="true" />
          <span>Character Sheet</span>
          {#if displayCharacter}
            <Badge variant="outline" class="rounded-full font-mono text-[11px] normal-case"
              >{displayCharacter.name}</Badge
            >
          {/if}
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            onclick={() => (showBaselineDetails = !showBaselineDetails)}
            disabled={!displayCharacter}
            title={showBaselineDetails ? "Hide details" : "Show details"}
            aria-label={showBaselineDetails ? "Hide details" : "Show details"}
          >
            {#if showBaselineDetails}
              <EyeOff size={12} strokeWidth={2} aria-hidden="true" />
            {:else}
              <Eye size={12} strokeWidth={2} aria-hidden="true" />
            {/if}
          </Button>
          <Button
            variant="outline"
            size="icon"
            class="h-8 w-8"
            onclick={startEdit}
            disabled={editing || !canEdit || !displayCharacter || saving}
            title="Edit character sheet"
            aria-label="Edit character sheet"
          >
            <SquarePen size={12} strokeWidth={2} aria-hidden="true" />
          </Button>
        </div>
      </div>
      <ScrollArea class="max-h-[calc(100dvh-3.25rem)]">
        <div class="p-4">
          {#if isInspectMode}
            {#if inspectLoading}
              <Card.Root class="rounded-lg p-0 py-0 gap-0">
                <Card.Content class="p-4 text-sm text-muted-foreground">Loading character...</Card.Content>
              </Card.Root>
            {:else if inspectError}
              <Card.Root class="rounded-lg p-0 py-0 gap-0">
                <Card.Content class="p-4 text-sm text-muted-foreground">
                  <div>{inspectError}</div>
                  <Button variant="outline" size="sm" class="mt-3" onclick={retryInspect}>Retry</Button>
                </Card.Content>
              </Card.Root>
            {:else}
              {@render charContent()}
            {/if}
          {:else}
            {@render charContent()}
          {/if}
        </div>
      </ScrollArea>
    </SheetContent>
  </Sheet>
{/if}
