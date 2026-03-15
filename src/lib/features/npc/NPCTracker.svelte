<script lang="ts">
  import { onDestroy } from "svelte"
  import { get } from "svelte/store"
  import { AppError } from "@/errors"
  import { stories } from "@/services/stories"
  import { turns as turnsService } from "@/services/turns"
  import { showNPCTracker, showError, showQuietNotice, showConfirm } from "@/stores/ui"
  import { timeouts } from "@/stores/settings"
  import { currentStoryId, currentStoryModules, npcs, llmUpdateId, isGenerating, markLlmUpdate } from "@/stores/game"
  import type { NPCState } from "@/shared/types"
  import { createRequestId } from "@/utils/ids"
  import { genderIcon, normalizeGender, splitCsv } from "@/utils/text"
  import { getDiffSegments } from "@/utils/textDiff"
  import EditableFieldList from "@/components/inputs/EditableFieldList.svelte"
  import type { EditField } from "@/components/inputs/editableFieldTypes"
  import { cn } from "@/utils.js"
  import IconMale from "@/components/icons/IconMale.svelte"
  import IconFemale from "@/components/icons/IconFemale.svelte"
  import IconIntersex from "@/components/icons/IconIntersex.svelte"
  import IconTransgender from "@/components/icons/IconTransgender.svelte"
  import IconFace from "@/components/icons/IconFace.svelte"
  import IconShirt from "@/components/icons/IconShirt.svelte"
  import IconDocument from "@/components/icons/IconDocument.svelte"
  import IconMapPin from "@/components/icons/IconMapPin.svelte"
  import IconStar from "@/components/icons/IconStar.svelte"
  import IconPencilSquare from "@/components/icons/IconPencilSquare.svelte"
  import IconTrash from "@/components/icons/IconTrash.svelte"
  import NPCTrackerHeaderContent from "@/features/npc/NPCTrackerHeaderContent.svelte"
  import { Badge } from "@/components/ui/badge"
  import { Button } from "@/components/ui/button"
  import { Input } from "@/components/ui/input"
  import { Sheet, SheetContent } from "@/components/ui/sheet"
  import { ScrollArea } from "@/components/ui/scroll-area"

  let { inline = false }: { inline?: boolean } = $props()
  let showBaselineDetails = $state(false)
  const useNpcAppearance = $derived($currentStoryModules?.npc_appearance_clothing ?? true)
  const useNpcPersonalityTraits = $derived($currentStoryModules?.npc_personality_traits ?? true)
  const useNpcMajorFlaws = $derived($currentStoryModules?.npc_major_flaws ?? true)
  const useNpcQuirks = $derived($currentStoryModules?.npc_quirks ?? true)
  const useNpcPerks = $derived($currentStoryModules?.npc_perks ?? true)
  const useNpcLocation = $derived($currentStoryModules?.npc_location ?? true)
  const useNpcActivity = $derived($currentStoryModules?.npc_activity ?? true)

  function npcFieldId(npc: NPCState, field: string): string {
    const base = npc.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
    return `npc-${field}-${base || "unknown"}`
  }

  function npcEditFields(npc: NPCState): EditField[] {
    const fields: EditField[] = [
      {
        id: npcFieldId(npc, "name"),
        label: "Name",
        kind: "input",
        value: draft.name,
        onInput: (v) => (draft.name = v),
      },
      {
        id: npcFieldId(npc, "race"),
        label: "Race",
        kind: "input",
        value: draft.race,
        onInput: (v) => (draft.race = v),
      },
      {
        id: npcFieldId(npc, "gender"),
        label: "Gender",
        kind: "input",
        value: draft.gender,
        onInput: (v) => (draft.gender = v),
      },
    ]

    if (useNpcLocation) {
      fields.push({
        id: npcFieldId(npc, "location"),
        label: "Current Location",
        kind: "input",
        value: draft.location,
        onInput: (v) => (draft.location = v),
      })
    }

    fields.push({
      id: npcFieldId(npc, "description"),
      label: "Description",
      kind: "textarea",
      value: draft.generalDescription,
      onInput: (v) => (draft.generalDescription = v),
    })

    if (useNpcAppearance) {
      fields.push(
        {
          id: npcFieldId(npc, "baseline-appearance"),
          label: "Baseline Appearance",
          kind: "textarea",
          value: draft.baselineAppearance,
          onInput: (v) => (draft.baselineAppearance = v),
        },
        {
          id: npcFieldId(npc, "current-appearance"),
          label: "Current Appearance",
          kind: "textarea",
          value: draft.currentAppearance,
          onInput: (v) => (draft.currentAppearance = v),
        },
        {
          id: npcFieldId(npc, "clothing"),
          label: "Current Clothing",
          kind: "textarea",
          value: draft.clothing,
          onInput: (v) => (draft.clothing = v),
        },
      )
    }

    if (useNpcPersonalityTraits) {
      fields.push({
        id: npcFieldId(npc, "traits"),
        label: "Personality Traits (comma separated)",
        kind: "input",
        value: draft.traits,
        onInput: (v) => (draft.traits = v),
      })
    }
    if (useNpcMajorFlaws) {
      fields.push({
        id: npcFieldId(npc, "major-flaws"),
        label: "Major Flaws (comma separated)",
        kind: "input",
        value: draft.majorFlaws,
        onInput: (v) => (draft.majorFlaws = v),
      })
    }
    if (useNpcQuirks) {
      fields.push({
        id: npcFieldId(npc, "quirks"),
        label: "Quirks (comma separated)",
        kind: "input",
        value: draft.quirks,
        onInput: (v) => (draft.quirks = v),
      })
    }
    if (useNpcPerks) {
      fields.push({
        id: npcFieldId(npc, "perks"),
        label: "Perks (comma separated)",
        kind: "input",
        value: draft.perks,
        onInput: (v) => (draft.perks = v),
      })
    }
    if (useNpcActivity) {
      fields.push({
        id: npcFieldId(npc, "current-activity"),
        label: "Current Activity",
        kind: "textarea",
        value: draft.currentActivity,
        onInput: (v) => (draft.currentActivity = v),
      })
    }

    return fields
  }

  function startNpcEdit(npc: NPCState) {
    editingNpcName = npc.name
    draft = {
      name: npc.name,
      race: npc.race,
      gender: npc.gender,
      generalDescription: npc.general_description ?? "",
      location: npc.current_location,
      baselineAppearance: npc.baseline_appearance,
      currentAppearance: npc.current_appearance,
      clothing: npc.current_clothing,
      currentActivity: npc.current_activity,
      traits: npc.personality_traits.join(", "),
      majorFlaws: npc.major_flaws.join(", "),
      quirks: npc.quirks.join(", "),
      perks: npc.perks.join(", "),
    }
  }

  function cancelNpcEdit() {
    editingNpcName = null
  }

  async function saveNpcEdit() {
    if (!$currentStoryId) {
      showError("No active story to update.")
      return
    }
    if (!editingNpcName) return
    const name = draft.name.trim()
    const race = draft.race.trim()
    const gender = normalizeGender(draft.gender, "")
    const generalDescription = draft.generalDescription.trim()
    const location = draft.location.trim()
    const baselineAppearance = draft.baselineAppearance.trim()
    const currentAppearance = draft.currentAppearance.trim()
    const clothing = draft.clothing.trim()
    const currentActivity = draft.currentActivity.trim()
    if (!name || !race || !gender) {
      showError("Name, race, and gender are required.")
      return
    }
    if (!generalDescription) {
      showError("Description is required.")
      return
    }
    const traits = useNpcPersonalityTraits ? splitCsv(draft.traits) : []
    const majorFlaws = useNpcMajorFlaws ? splitCsv(draft.majorFlaws) : []
    const quirks = useNpcQuirks ? splitCsv(draft.quirks) : []
    const perks = useNpcPerks ? splitCsv(draft.perks) : []
    const existingNpc = $npcs.find((npc) => npc.name === editingNpcName)
    const nextBaselineAppearance = useNpcAppearance
      ? baselineAppearance || existingNpc?.baseline_appearance || ""
      : existingNpc?.baseline_appearance || ""
    const nextCurrentAppearance = useNpcAppearance
      ? currentAppearance || existingNpc?.current_appearance || ""
      : existingNpc?.current_appearance || ""
    const nextClothing = useNpcAppearance
      ? clothing || existingNpc?.current_clothing || ""
      : existingNpc?.current_clothing || ""
    const updatedNpc: NPCState = {
      name,
      race,
      gender,
      general_description: generalDescription,
      current_location: useNpcLocation
        ? location || existingNpc?.current_location || ""
        : (existingNpc?.current_location ?? ""),
      baseline_appearance: nextBaselineAppearance,
      current_appearance: nextCurrentAppearance || nextBaselineAppearance,
      current_clothing: nextClothing,
      current_activity: useNpcActivity
        ? currentActivity || existingNpc?.current_activity || ""
        : (existingNpc?.current_activity ?? ""),
      personality_traits: useNpcPersonalityTraits
        ? traits.length > 0
          ? traits
          : (existingNpc?.personality_traits ?? [])
        : (existingNpc?.personality_traits ?? []),
      major_flaws: useNpcMajorFlaws
        ? majorFlaws.length > 0
          ? majorFlaws
          : (existingNpc?.major_flaws ?? [])
        : (existingNpc?.major_flaws ?? []),
      quirks: useNpcQuirks ? (quirks.length > 0 ? quirks : (existingNpc?.quirks ?? [])) : (existingNpc?.quirks ?? []),
      perks: useNpcPerks ? (perks.length > 0 ? perks : (existingNpc?.perks ?? [])) : (existingNpc?.perks ?? []),
      inventory: existingNpc?.inventory ?? [],
    }
    const updatedList = $npcs.map((npc) => (npc.name === editingNpcName ? updatedNpc : npc))
    savingNpc = true
    try {
      const result = await stories.updateState($currentStoryId, { npcs: updatedList })
      npcs.set(result.npcs)
      showQuietNotice("NPC updated.")
      editingNpcName = null
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Failed to update NPC.")
      }
    } finally {
      savingNpc = false
    }
  }

  async function deleteNpc(npc: NPCState) {
    if (!$currentStoryId) {
      showError("No active story to update.")
      return
    }
    if ($isGenerating || savingNpc || deletingNpcName) return

    const confirmed = await showConfirm({
      title: "Delete NPC",
      message: `Delete ${npc.name}? This cannot be undone.`,
      confirmLabel: "Delete",
      danger: true,
    })
    if (!confirmed) return

    deletingNpcName = npc.name
    try {
      const updatedList = $npcs.filter((entry) => entry.name !== npc.name)
      const result = await stories.updateState($currentStoryId, { npcs: updatedList })
      npcs.set(result.npcs)
      showQuietNotice("NPC deleted.")
      if (editingNpcName === npc.name) {
        editingNpcName = null
      }
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Failed to delete NPC.")
      }
    } finally {
      deletingNpcName = null
    }
  }

  let lastNpcSigs = new Map<string, string>()
  let lastLlmUpdateId = 0
  let flashNpcNames = $state<string[]>([])
  let flashTimer: number | null = null
  let npcChangeIds = $state(new Map<string, number>())
  let sortedNpcs = $state<NPCState[]>([])
  let sidebarBodyEl = $state<HTMLDivElement | null>(null)
  let panelBodyEl = $state<HTMLDivElement | null>(null)
  let lastSortSig = $state("")
  let editingNpcName = $state<string | null>(null)
  let savingNpc = $state(false)
  let addingNpc = $state(false)
  let newNpcName = $state("")
  let deletingNpcName = $state<string | null>(null)
  type NpcDraft = {
    name: string
    race: string
    gender: string
    generalDescription: string
    location: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    currentActivity: string
    traits: string
    majorFlaws: string
    quirks: string
    perks: string
  }
  let draft = $state<NpcDraft>({
    name: "",
    race: "",
    gender: "",
    generalDescription: "",
    location: "",
    baselineAppearance: "",
    currentAppearance: "",
    clothing: "",
    currentActivity: "",
    traits: "",
    majorFlaws: "",
    quirks: "",
    perks: "",
  })

  async function addNpc() {
    if ($isGenerating || addingNpc) return
    if (!$currentStoryId) {
      showError("No active story to update.")
      return
    }
    const name = newNpcName.trim()
    if (!name) {
      showError("Name is required.")
      return
    }
    if ($npcs.some((npc) => npc.name.toLowerCase() === name.toLowerCase())) {
      showError(`NPC "${name}" already exists.`)
      return
    }
    addingNpc = true
    isGenerating.set(true)
    try {
      const result = await turnsService.createNpc($currentStoryId, name, createRequestId())
      npcs.set(result.npcs)
      markLlmUpdate()
      newNpcName = ""
      showQuietNotice(`Added NPC: ${result.npc.name}.`)
    } catch (err) {
      if (err instanceof AppError) {
        showError(err.message)
      } else {
        showError("Failed to add NPC. Is KoboldCpp running?")
      }
    } finally {
      addingNpc = false
      isGenerating.set(false)
    }
  }

  function npcSignature(npc: NPCState): string {
    return [
      npc.name,
      npc.race,
      npc.gender,
      useNpcLocation ? npc.current_location : "",
      ...(useNpcAppearance
        ? [npc.baseline_appearance, npc.current_appearance, npc.current_clothing]
        : [npc.general_description ?? ""]),
      useNpcActivity ? npc.current_activity : "",
      useNpcPersonalityTraits ? npc.personality_traits.join(",") : "",
      useNpcMajorFlaws ? npc.major_flaws.join(",") : "",
      useNpcQuirks ? npc.quirks.join(",") : "",
      useNpcPerks ? npc.perks.join(",") : "",
    ].join("|")
  }

  function triggerNpcFlash(names: string[]) {
    flashNpcNames = names
    if (flashTimer) window.clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => {
      flashNpcNames = []
    }, get(timeouts).uiFlashMs)
  }

  function sortByLatestChange(list: NPCState[], changeIds: Map<string, number>): NPCState[] {
    return list
      .map((npc, index) => ({
        npc,
        index,
        changeId: changeIds.get(npc.name) ?? 0,
      }))
      .sort((a, b) => {
        if (b.changeId !== a.changeId) return b.changeId - a.changeId
        return a.index - b.index
      })
      .map((entry) => entry.npc)
  }

  $effect(() => {
    if ($npcs.length === 0) {
      sortedNpcs = []
      if (lastNpcSigs.size > 0 || flashNpcNames.length > 0 || npcChangeIds.size > 0) {
        lastNpcSigs = new Map<string, string>()
        flashNpcNames = []
        npcChangeIds = new Map<string, number>()
      }
      return
    }

    const nextChangeIds = new Map(npcChangeIds)
    const existingNames = new Set<string>()
    let updated = false
    for (const npc of $npcs) {
      existingNames.add(npc.name)
      if (!nextChangeIds.has(npc.name)) {
        nextChangeIds.set(npc.name, 0)
        updated = true
      }
    }
    for (const name of nextChangeIds.keys()) {
      if (!existingNames.has(name)) {
        nextChangeIds.delete(name)
        updated = true
      }
    }
    if (lastNpcSigs.size === 0) {
      const initial = new Map<string, string>()
      for (const npc of $npcs) {
        initial.set(npc.name, npcSignature(npc))
        if (!nextChangeIds.has(npc.name)) {
          nextChangeIds.set(npc.name, 0)
        }
      }
      lastNpcSigs = initial
      npcChangeIds = nextChangeIds
    } else if (updated) {
      npcChangeIds = nextChangeIds
    }
    const changeIds = updated || lastNpcSigs.size === 0 ? nextChangeIds : npcChangeIds
    sortedNpcs = sortByLatestChange($npcs, changeIds)
  })

  $effect(() => {
    const nextSig = sortedNpcs.map((npc) => npc.name).join("|")
    if (nextSig !== lastSortSig) {
      if (lastSortSig.length > 0) {
        const root = inline ? sidebarBodyEl : $showNPCTracker ? panelBodyEl : null
        if (root) root.scrollTop = 0
      }
      lastSortSig = nextSig
    }
  })

  $effect(() => {
    if ($llmUpdateId !== lastLlmUpdateId) {
      const nextSigs = new Map<string, string>()
      const changed: string[] = []
      for (const npc of $npcs) {
        const sig = npcSignature(npc)
        nextSigs.set(npc.name, sig)
        const prev = lastNpcSigs.get(npc.name)
        if (!prev || prev !== sig) {
          changed.push(npc.name)
        }
      }
      if (changed.length > 0) {
        triggerNpcFlash(changed)
        const nextChangeIds = new Map(npcChangeIds)
        for (const name of changed) {
          nextChangeIds.set(name, $llmUpdateId)
        }
        npcChangeIds = nextChangeIds
      }
      lastNpcSigs = nextSigs
      lastLlmUpdateId = $llmUpdateId
    }
  })

  $effect(() => {
    if (!inline && !$showNPCTracker && editingNpcName) {
      editingNpcName = null
    }
  })

  onDestroy(() => {
    if (flashTimer) window.clearTimeout(flashTimer)
  })
</script>

{#snippet npcContent()}
  <div class="space-y-3">
    <div class="flex items-center gap-2">
      <Input
        type="text"
        placeholder="Add NPC by name"
        bind:value={newNpcName}
        disabled={$isGenerating || addingNpc || !$currentStoryId}
        onkeydown={(e) => {
          if (e.key === "Enter") addNpc()
        }}
      />
      <Button onclick={addNpc} disabled={$isGenerating || addingNpc || !$currentStoryId || !newNpcName.trim()}>
        {addingNpc ? "Adding..." : "Add"}
      </Button>
    </div>
    {#if $npcs.length === 0}
      <div
        class="grid place-items-center rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground"
      >
        No known characters yet.
      </div>
    {:else}
      {#each sortedNpcs as npc (npc.name)}
        <div class={cn("rounded-lg border bg-card p-4", flashNpcNames.includes(npc.name) && "ring-2 ring-primary/30")}>
          <div class="flex items-start justify-between gap-3">
            <div class="min-w-0">
              <div class="flex items-center gap-2">
                <div class="truncate text-base font-semibold text-foreground">{npc.name}</div>
                {#if genderIcon(npc.gender) === "male"}
                  <IconMale size={14} strokeWidth={2} className="shrink-0 opacity-60" />
                {:else if genderIcon(npc.gender) === "female"}
                  <IconFemale size={14} strokeWidth={2} className="shrink-0 opacity-60" />
                {:else if genderIcon(npc.gender) === "intersex"}
                  <IconIntersex size={14} strokeWidth={2} className="shrink-0 opacity-60" />
                {:else if genderIcon(npc.gender) === "transgender"}
                  <IconTransgender size={14} strokeWidth={2} className="shrink-0 opacity-60" />
                {/if}
              </div>
              <div class="mt-0.5 text-sm italic text-muted-foreground">
                {npc.race}{npc.gender ? ` · ${npc.gender}` : ""}
              </div>
            </div>
            <div class="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                class="h-8 w-8"
                onclick={() => startNpcEdit(npc)}
                disabled={savingNpc ||
                  editingNpcName === npc.name ||
                  (editingNpcName && editingNpcName !== npc.name) ||
                  deletingNpcName === npc.name ||
                  !$currentStoryId}
                title={editingNpcName === npc.name ? "Editing NPC" : "Edit NPC"}
                aria-label={editingNpcName === npc.name ? "Editing NPC" : "Edit NPC"}
              >
                <IconPencilSquare size={12} strokeWidth={2} />
              </Button>
              <Button
                variant="outline"
                size="icon"
                class="h-8 w-8 border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                onclick={() => deleteNpc(npc)}
                disabled={savingNpc || deletingNpcName !== null || !$currentStoryId}
                title="Delete NPC"
                aria-label="Delete NPC"
              >
                <IconTrash size={12} strokeWidth={2} />
              </Button>
            </div>
          </div>

          {#if editingNpcName === npc.name}
            <div class="mt-4 space-y-4">
              <EditableFieldList fields={npcEditFields(npc)} />
              <div class="flex items-center justify-end gap-2">
                <Button variant="outline" onclick={cancelNpcEdit} disabled={savingNpc}>Cancel</Button>
                <Button onclick={saveNpcEdit} disabled={savingNpc || !$currentStoryId}>
                  {savingNpc ? "Saving..." : "Save"}
                </Button>
              </div>
            </div>
          {:else}
            {#if useNpcLocation}
              <div class="mt-4 flex items-start gap-2 text-sm text-foreground">
                <IconMapPin size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted-foreground" />
                <span>{npc.current_location}</span>
              </div>
            {/if}

            <div class="mt-3 flex items-start gap-2 text-sm text-foreground">
              <IconDocument size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted-foreground" />
              <span>{npc.general_description || "Unknown description"}</span>
            </div>

            {#if useNpcAppearance}
              {#if showBaselineDetails}
                <div class="mt-3 flex items-start gap-2 text-sm text-foreground">
                  <IconFace size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted-foreground" />
                  <span>{npc.baseline_appearance}</span>
                </div>
              {/if}

              <div class="mt-3 flex items-start gap-2 text-sm text-foreground">
                <IconFace size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted-foreground" />
                <span>
                  {#each getDiffSegments(npc.baseline_appearance, npc.current_appearance) as segment}
                    <span class={cn(segment.added && "font-semibold text-primary")}>{segment.text}</span>
                  {/each}
                </span>
              </div>

              <div class="mt-3 flex items-start gap-2 text-sm italic text-muted-foreground">
                <IconShirt size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted-foreground" />
                <span>{npc.current_clothing}</span>
              </div>
            {/if}

            {#if useNpcActivity}
              <div class="mt-3 flex items-start gap-2 text-sm text-foreground">
                <IconDocument size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted-foreground" />
                <span>{npc.current_activity}</span>
              </div>
            {/if}

            {#if (useNpcPersonalityTraits && npc.personality_traits.length > 0) || (useNpcMajorFlaws && npc.major_flaws.length > 0) || (useNpcQuirks && npc.quirks.length > 0) || (useNpcPerks && npc.perks.length > 0)}
              <div class="mt-3 flex items-start gap-2">
                <IconStar size={13} strokeWidth={1.5} className="mt-0.5 shrink-0 text-muted-foreground" />
                <div class="flex flex-wrap gap-2">
                  {#if useNpcPersonalityTraits}
                    {#each npc.personality_traits as trait}
                      <Badge variant="outline" class="rounded-full font-mono text-[11px]">{trait}</Badge>
                    {/each}
                  {/if}
                  {#if useNpcMajorFlaws}
                    {#each npc.major_flaws as trait}
                      <Badge variant="outline" class="rounded-full font-mono text-[11px]">{trait}</Badge>
                    {/each}
                  {/if}
                  {#if useNpcQuirks}
                    {#each npc.quirks as trait}
                      <Badge variant="outline" class="rounded-full font-mono text-[11px]">{trait}</Badge>
                    {/each}
                  {/if}
                  {#if useNpcPerks}
                    {#each npc.perks as trait}
                      <Badge variant="outline" class="rounded-full font-mono text-[11px]">{trait}</Badge>
                    {/each}
                  {/if}
                </div>
              </div>
            {/if}
          {/if}
        </div>
      {/each}
    {/if}
  </div>
{/snippet}

{#if inline}
  <div class="flex h-dvh flex-col overflow-hidden border-l bg-card">
    <div class="border-b px-4 py-3">
      <NPCTrackerHeaderContent
        count={$npcs.length}
        {useNpcAppearance}
        {showBaselineDetails}
        disableBaselineToggle={$npcs.length === 0}
        onToggleBaseline={() => (showBaselineDetails = !showBaselineDetails)}
      />
    </div>
    <ScrollArea class="min-h-0 flex-1" bind:viewportRef={sidebarBodyEl}>
      <div class="p-4">
        {@render npcContent()}
      </div>
    </ScrollArea>
  </div>
{:else}
  <Sheet open={$showNPCTracker} onOpenChange={(next) => showNPCTracker.set(next)}>
    <SheetContent side="right" class="p-0">
      <div class="border-b px-4 py-3">
        <NPCTrackerHeaderContent
          count={$npcs.length}
          {useNpcAppearance}
          {showBaselineDetails}
          disableBaselineToggle={$npcs.length === 0}
          showClose
          onToggleBaseline={() => (showBaselineDetails = !showBaselineDetails)}
          onClose={() => showNPCTracker.set(false)}
        />
      </div>
      <ScrollArea class="max-h-[calc(100dvh-3.25rem)]" bind:viewportRef={panelBodyEl}>
        <div class="p-4">
          {@render npcContent()}
        </div>
      </ScrollArea>
    </SheetContent>
  </Sheet>
{/if}
