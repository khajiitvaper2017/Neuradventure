<script lang="ts">
  import { onDestroy } from "svelte"
  import { get } from "svelte/store"
  import { AppError } from "@/errors"
  import { stories } from "@/services/stories"
  import {
    activeScreen,
    charSheetCharacterId,
    closeCharSheet,
    showCharSheet,
    showError,
    showQuietNotice,
  } from "@/stores/ui"
  import { character, currentStoryId, currentStoryModules, llmUpdateId } from "@/stores/game"
  import { timeouts } from "@/stores/settings"
  import type { MainCharacterState } from "@/shared/types"
  import { cn } from "@/utils.js"
  import { genderIcon, normalizeGender, splitCsv } from "@/utils/text"
  import EditableFieldList from "@/components/inputs/EditableFieldList.svelte"
  import type { EditField } from "@/components/inputs/editableFieldTypes"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Sheet, SheetContent } from "@/components/ui/sheet"
  import { ScrollArea } from "@/components/ui/scroll-area"
  import IconMale from "@/components/icons/IconMale.svelte"
  import IconFemale from "@/components/icons/IconFemale.svelte"
  import IconIntersex from "@/components/icons/IconIntersex.svelte"
  import IconTransgender from "@/components/icons/IconTransgender.svelte"
  import IconFace from "@/components/icons/IconFace.svelte"
  import IconShirt from "@/components/icons/IconShirt.svelte"
  import IconStar from "@/components/icons/IconStar.svelte"
  import IconCube from "@/components/icons/IconCube.svelte"
  import IconDotSmall from "@/components/icons/IconDotSmall.svelte"
  import IconDocument from "@/components/icons/IconDocument.svelte"
  import IconPencilSquare from "@/components/icons/IconPencilSquare.svelte"

  let { inline = false }: { inline?: boolean } = $props()

  const isGameScreen = $derived($activeScreen === "game")
  const canEdit = $derived((inline || isGameScreen) && $currentStoryId !== null)

  let inspectCharacter = $state<MainCharacterState | null>(null)
  let inspectLoading = $state(false)
  let inspectError = $state<string | null>(null)
  let inspectRefresh = $state(0)
  let inspectFetchNonce = 0

  const isInspectMode = $derived(!inline && !isGameScreen && $showCharSheet && $charSheetCharacterId !== null)
  const displayCharacter = $derived(inline || isGameScreen ? $character : inspectCharacter)

  function retryInspect() {
    inspectRefresh += 1
  }

  type CharacterSigs = {
    identity: string
    generalDescription: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    inventory: string
  }

  let lastSigs: CharacterSigs | null = null
  let lastLlmUpdateId = 0
  let flashIdentity = $state(false)
  let flashAppearance = $state(false)
  let flashClothing = $state(false)
  let flashInventory = $state(false)
  let identityTimer: number | null = null
  let appearanceTimer: number | null = null
  let clothingTimer: number | null = null
  let inventoryTimer: number | null = null
  let editing = $state(false)
  let saving = $state(false)
  let showBaselineDetails = $state(false)
  const useAppearance = $derived($currentStoryModules?.character_appearance_clothing ?? true)
  const usePersonalityTraits = $derived($currentStoryModules?.character_personality_traits ?? true)
  const useMajorFlaws = $derived($currentStoryModules?.character_major_flaws ?? true)
  const useQuirks = $derived($currentStoryModules?.character_quirks ?? true)
  const usePerks = $derived($currentStoryModules?.character_perks ?? true)
  const useInventory = $derived($currentStoryModules?.character_inventory ?? true)
  const showTraitSection = $derived(usePersonalityTraits || useMajorFlaws || useQuirks || usePerks)

  type InventoryDraft = { name: string; description: string }
  type CharacterDraft = {
    name: string
    race: string
    gender: string
    generalDescription: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    personalityTraits: string
    majorFlaws: string
    quirks: string
    perks: string
    inventory: InventoryDraft[]
  }
  let draft = $state<CharacterDraft>({
    name: "",
    race: "",
    gender: "",
    generalDescription: "",
    baselineAppearance: "",
    currentAppearance: "",
    clothing: "",
    personalityTraits: "",
    majorFlaws: "",
    quirks: "",
    perks: "",
    inventory: [],
  })

  function buildCharacterSigs(c: MainCharacterState): CharacterSigs {
    return {
      identity: `${c.name}|${c.race}|${c.gender}`,
      generalDescription: c.general_description.trim(),
      baselineAppearance: c.baseline_appearance,
      currentAppearance: c.current_appearance,
      clothing: c.current_clothing,
      inventory: c.inventory.map((item) => `${item.name}:${item.description}`).join("|"),
    }
  }

  function triggerFlash(kind: "identity" | "appearance" | "clothing" | "inventory") {
    const flashMs = get(timeouts).uiFlashMs
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

  function characterFields(): EditField[] {
    const fields: EditField[] = [
      { id: "cs-name", label: "Name", kind: "input", value: draft.name, onInput: (v) => (draft.name = v) },
      { id: "cs-race", label: "Race", kind: "input", value: draft.race, onInput: (v) => (draft.race = v) },
      { id: "cs-gender", label: "Gender", kind: "input", value: draft.gender, onInput: (v) => (draft.gender = v) },
    ]
    fields.push({
      id: "cs-description",
      label: "Description",
      kind: "textarea",
      value: draft.generalDescription,
      onInput: (v) => (draft.generalDescription = v),
    })

    if (useAppearance) {
      fields.push(
        {
          id: "cs-baseline-appearance",
          label: "Baseline Appearance",
          kind: "textarea",
          value: draft.baselineAppearance,
          onInput: (v) => (draft.baselineAppearance = v),
        },
        {
          id: "cs-current-appearance",
          label: "Current Appearance",
          kind: "textarea",
          value: draft.currentAppearance,
          onInput: (v) => (draft.currentAppearance = v),
        },
        {
          id: "cs-clothing",
          label: "Wearing",
          kind: "textarea",
          value: draft.clothing,
          onInput: (v) => (draft.clothing = v),
        },
      )
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
    if (useQuirks) {
      fields.push({
        id: "cs-quirks",
        label: "Quirks (comma separated)",
        kind: "input",
        value: draft.quirks,
        onInput: (v) => (draft.quirks = v),
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
    return fields
  }

  function startEdit() {
    if (!canEdit) return
    if (!$character) return
    draft = {
      name: $character.name,
      race: $character.race,
      gender: $character.gender,
      generalDescription: $character.general_description ?? "",
      baselineAppearance: $character.baseline_appearance,
      currentAppearance: $character.current_appearance,
      clothing: $character.current_clothing,
      personalityTraits: $character.personality_traits.join(", "),
      majorFlaws: $character.major_flaws.join(", "),
      quirks: $character.quirks.join(", "),
      perks: $character.perks.join(", "),
      inventory: $character.inventory.map((item) => ({ name: item.name, description: item.description })),
    }
    editing = true
  }

  function cancelEdit() {
    editing = false
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
    const name = draft.name.trim()
    const race = draft.race.trim()
    const gender = normalizeGender(draft.gender, "")
    const generalDescription = draft.generalDescription.trim()
    const baselineAppearance = draft.baselineAppearance.trim()
    const currentAppearance = draft.currentAppearance.trim()
    const clothing = draft.clothing.trim()
    if (!name || !race || !gender) {
      showError("Name, race, and gender are required.")
      return
    }
    if (!generalDescription) {
      showError("Description is required.")
      return
    }
    const existing = $character
    const personalityTraits = usePersonalityTraits
      ? splitCsv(draft.personalityTraits)
      : (existing?.personality_traits ?? [])
    const majorFlaws = useMajorFlaws ? splitCsv(draft.majorFlaws) : (existing?.major_flaws ?? [])
    const quirks = useQuirks ? splitCsv(draft.quirks) : (existing?.quirks ?? [])
    const perks = usePerks ? splitCsv(draft.perks) : (existing?.perks ?? [])
    const inventory = useInventory
      ? draft.inventory
          .map((item) => ({ name: item.name.trim(), description: item.description.trim() }))
          .filter((item) => item.name.length > 0 || item.description.length > 0)
      : (existing?.inventory ?? [])
    if (useInventory) {
      for (const item of inventory) {
        if (!item.name || !item.description) {
          showError("Inventory items need both a name and description.")
          return
        }
      }
    }
    const nextCharacter: MainCharacterState = {
      name,
      race,
      gender,
      general_description: generalDescription,
      current_location: existing?.current_location ?? "",
      baseline_appearance: !useAppearance
        ? (existing?.baseline_appearance ?? "")
        : baselineAppearance || existing?.baseline_appearance || "",
      current_appearance: !useAppearance
        ? (existing?.current_appearance ?? "")
        : currentAppearance ||
          existing?.current_appearance ||
          baselineAppearance ||
          existing?.baseline_appearance ||
          "",
      current_clothing: !useAppearance
        ? (existing?.current_clothing ?? "")
        : clothing || existing?.current_clothing || "",
      personality_traits: personalityTraits.length > 0 ? personalityTraits : (existing?.personality_traits ?? []),
      major_flaws: majorFlaws.length > 0 ? majorFlaws : (existing?.major_flaws ?? []),
      quirks: quirks.length > 0 ? quirks : (existing?.quirks ?? []),
      perks: perks.length > 0 ? perks : (existing?.perks ?? []),
      inventory,
    }
    saving = true
    try {
      const result = await stories.updateState($currentStoryId, { character: nextCharacter })
      character.set(result.character)
      showQuietNotice("Character sheet updated.")
      editing = false
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Failed to update character sheet.")
      }
    } finally {
      saving = false
    }
  }

  $effect(() => {
    if (!lastSigs && $character) {
      lastSigs = buildCharacterSigs($character)
    }
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
      if ($character) {
        const nextSigs = buildCharacterSigs($character)
        if (lastSigs) {
          if (nextSigs.identity !== lastSigs.identity) triggerFlash("identity")
          if (nextSigs.generalDescription !== lastSigs.generalDescription) triggerFlash("appearance")
          if (
            useAppearance &&
            (nextSigs.baselineAppearance !== lastSigs.baselineAppearance ||
              nextSigs.currentAppearance !== lastSigs.currentAppearance)
          ) {
            triggerFlash("appearance")
          }
          if (useAppearance && nextSigs.clothing !== lastSigs.clothing) triggerFlash("clothing")
          if (useInventory && nextSigs.inventory !== lastSigs.inventory) triggerFlash("inventory")
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
  })
</script>

{#snippet charContent()}
  {#if displayCharacter}
    {#if editing}
      <div class="space-y-4">
        <EditableFieldList fields={characterFields()} />
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
              {#each draft.inventory as item, index}
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
      <div class={cn("rounded-lg border bg-card p-4", flashIdentity && "ring-2 ring-primary/30")}>
        <div class="flex items-center gap-2 text-lg font-semibold text-foreground">
          <span class="truncate">{displayCharacter.name}</span>
          {#if genderIcon(displayCharacter.gender) === "male"}
            <IconMale size={14} strokeWidth={2} className="shrink-0 opacity-60" />
          {:else if genderIcon(displayCharacter.gender) === "female"}
            <IconFemale size={14} strokeWidth={2} className="shrink-0 opacity-60" />
          {:else if genderIcon(displayCharacter.gender) === "intersex"}
            <IconIntersex size={14} strokeWidth={2} className="shrink-0 opacity-60" />
          {:else if genderIcon(displayCharacter.gender) === "transgender"}
            <IconTransgender size={14} strokeWidth={2} className="shrink-0 opacity-60" />
          {/if}
        </div>
        <div class="mt-1 text-sm italic text-muted-foreground">
          {displayCharacter.race}{displayCharacter.gender ? ` · ${displayCharacter.gender}` : ""}
        </div>
      </div>

      {#if showBaselineDetails}
        <div class={cn("mt-3 rounded-lg border bg-card p-4", flashAppearance && "ring-2 ring-primary/30")}>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <IconFace size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
            <span>Description</span>
          </div>
          <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {displayCharacter.general_description || "Unknown description"}
          </div>
        </div>
      {/if}

      {#if useAppearance}
        {#if showBaselineDetails}
          <div class={cn("mt-3 rounded-lg border bg-card p-4", flashAppearance && "ring-2 ring-primary/30")}>
            <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <IconFace size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
              <span>Baseline Appearance</span>
            </div>
            <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
              {displayCharacter.baseline_appearance}
            </div>
          </div>
        {/if}

        <div class={cn("mt-3 rounded-lg border bg-card p-4", flashAppearance && "ring-2 ring-primary/30")}>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <IconFace size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
            <span>Current Appearance</span>
          </div>
          <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {displayCharacter.current_appearance}
          </div>
        </div>

        <div class={cn("mt-3 rounded-lg border bg-card p-4", flashClothing && "ring-2 ring-primary/30")}>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <IconShirt size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
            <span>Wearing</span>
          </div>
          <div class="mt-2 whitespace-pre-line text-sm leading-relaxed text-foreground">
            {displayCharacter.current_clothing}
          </div>
        </div>
      {/if}

      {#if showTraitSection && ((usePersonalityTraits && displayCharacter.personality_traits.length > 0) || (useMajorFlaws && displayCharacter.major_flaws.length > 0) || (useQuirks && displayCharacter.quirks.length > 0) || (usePerks && displayCharacter.perks.length > 0))}
        <div class="mt-3 rounded-lg border bg-card p-4">
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <IconStar size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
            <span>Traits · Flaws · Quirks · Perks</span>
          </div>
          <div class="mt-3 flex flex-wrap gap-2">
            {#if usePersonalityTraits}
              {#each displayCharacter.personality_traits as t}
                <Badge variant="outline" class="rounded-full font-mono text-[11px]">{t}</Badge>
              {/each}
            {/if}
            {#if useMajorFlaws}
              {#each displayCharacter.major_flaws as t}
                <Badge variant="outline" class="rounded-full font-mono text-[11px]">{t}</Badge>
              {/each}
            {/if}
            {#if useQuirks}
              {#each displayCharacter.quirks as t}
                <Badge variant="outline" class="rounded-full font-mono text-[11px]">{t}</Badge>
              {/each}
            {/if}
            {#if usePerks}
              {#each displayCharacter.perks as t}
                <Badge variant="outline" class="rounded-full font-mono text-[11px]">{t}</Badge>
              {/each}
            {/if}
          </div>
        </div>
      {/if}

      {#if useInventory}
        <div class={cn("mt-3 rounded-lg border bg-card p-4", flashInventory && "ring-2 ring-primary/30")}>
          <div class="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            <IconCube size={14} strokeWidth={1.5} className="shrink-0 opacity-70" />
            <span>Inventory ({displayCharacter.inventory.length})</span>
          </div>
          {#if displayCharacter.inventory.length === 0}
            <div class="mt-2 text-sm italic text-muted-foreground">Nothing</div>
          {:else}
            <ul class="mt-3 space-y-2">
              {#each displayCharacter.inventory as item}
                <li class="flex items-start gap-2">
                  <IconDotSmall size={12} strokeWidth={1.5} className="mt-1 shrink-0 text-muted-foreground" />
                  <div class="min-w-0">
                    <div class="text-sm font-medium text-foreground">{item.name}</div>
                    <div class="mt-0.5 text-xs text-muted-foreground">{item.description}</div>
                  </div>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
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
        <IconDocument size={16} strokeWidth={1.5} className="shrink-0 opacity-70" />
        <span>Character Sheet</span>
      </div>
      <div class="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          class="h-8 rounded-full px-3"
          onclick={() => (showBaselineDetails = !showBaselineDetails)}
          disabled={!displayCharacter}
        >
          {showBaselineDetails ? "Hide details" : "Show details"}
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
          <IconPencilSquare size={12} strokeWidth={2} />
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
          <IconDocument size={16} strokeWidth={1.5} className="shrink-0 opacity-70" />
          <span>Character Sheet</span>
        </div>
        <div class="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            class="h-8 rounded-full px-3"
            onclick={() => (showBaselineDetails = !showBaselineDetails)}
            disabled={!displayCharacter}
          >
            {showBaselineDetails ? "Hide details" : "Show details"}
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
            <IconPencilSquare size={12} strokeWidth={2} />
          </Button>
          <Button variant="ghost" size="icon" class="h-9 w-9" onclick={closeCharSheet} aria-label="Close">×</Button>
        </div>
      </div>
      <ScrollArea class="max-h-[calc(100dvh-3.25rem)]">
        <div class="p-4">
          {#if isInspectMode}
            {#if inspectLoading}
              <div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">Loading character...</div>
            {:else if inspectError}
              <div class="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
                <div>{inspectError}</div>
                <Button variant="outline" size="sm" class="mt-3" onclick={retryInspect}>Retry</Button>
              </div>
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
