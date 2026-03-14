<script lang="ts">
  import { onDestroy } from "svelte"
  import { get } from "svelte/store"
  import { api, ApiError } from "../../api/client.js"
  import { showNPCTracker, showError, showQuietNotice, showConfirm } from "../../stores/ui.js"
  import { timeouts } from "../../stores/settings.js"
  import {
    currentStoryId,
    currentStoryModules,
    npcs,
    llmUpdateId,
    isGenerating,
    markLlmUpdate,
  } from "../../stores/game.js"
  import type { NPCState } from "../../api/client.js"
  import { createRequestId } from "../../utils/ids.js"
  import { genderIcon, normalizeGender, splitCsv } from "../../utils/text.js"
  import { getDiffSegments } from "../../utils/textDiff.js"
  import EditableFieldList from "../../components/ui/EditableFieldList.svelte"
  import type { EditField } from "../../components/ui/editableFieldTypes.js"
  import IconMale from "../../components/icons/IconMale.svelte"
  import IconFemale from "../../components/icons/IconFemale.svelte"
  import IconIntersex from "../../components/icons/IconIntersex.svelte"
  import IconTransgender from "../../components/icons/IconTransgender.svelte"
  import IconFace from "../../components/icons/IconFace.svelte"
  import IconShirt from "../../components/icons/IconShirt.svelte"
  import IconDocument from "../../components/icons/IconDocument.svelte"
  import IconMapPin from "../../components/icons/IconMapPin.svelte"
  import IconStar from "../../components/icons/IconStar.svelte"
  import IconPencilSquare from "../../components/icons/IconPencilSquare.svelte"
  import IconTrash from "../../components/icons/IconTrash.svelte"
  import IconUsers from "../../components/icons/IconUsers.svelte"

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
      const result = await api.stories.updateState($currentStoryId, { npcs: updatedList })
      npcs.set(result.npcs)
      showQuietNotice("NPC updated.")
      editingNpcName = null
    } catch (err) {
      if (err instanceof ApiError) {
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
      const result = await api.stories.updateState($currentStoryId, { npcs: updatedList })
      npcs.set(result.npcs)
      showQuietNotice("NPC deleted.")
      if (editingNpcName === npc.name) {
        editingNpcName = null
      }
    } catch (err) {
      if (err instanceof ApiError) {
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
  let sidebarBodyEl = $state<HTMLElement | null>(null)
  let panelBodyEl = $state<HTMLElement | null>(null)
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
      const result = await api.turns.createNpc($currentStoryId, name, createRequestId())
      npcs.set(result.npcs)
      markLlmUpdate()
      newNpcName = ""
      showQuietNotice(`Added NPC: ${result.npc.name}.`)
    } catch (err) {
      if (err instanceof ApiError) {
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
  <div class="npc-add">
    <input
      class="text-input npc-add-input"
      type="text"
      placeholder="Add NPC by name"
      bind:value={newNpcName}
      disabled={$isGenerating || addingNpc || !$currentStoryId}
      onkeydown={(e) => {
        if (e.key === "Enter") addNpc()
      }}
    />
    <button
      class="btn-accent small npc-add-btn"
      onclick={addNpc}
      disabled={$isGenerating || addingNpc || !$currentStoryId || !newNpcName.trim()}
    >
      {addingNpc ? "Adding..." : "Add"}
    </button>
  </div>
  {#if $npcs.length === 0}
    <div class="empty">No known characters yet.</div>
  {:else}
    {#each sortedNpcs as npc}
      <div class="npc-card" class:flash={flashNpcNames.includes(npc.name)}>
        <div class="npc-header">
          <div class="npc-identity">
            <div class="npc-name">
              {npc.name}
              {#if genderIcon(npc.gender) === "male"}
                <IconMale size={14} strokeWidth={2} className="gender-icon" />
              {:else if genderIcon(npc.gender) === "female"}
                <IconFemale size={14} strokeWidth={2} className="gender-icon" />
              {:else if genderIcon(npc.gender) === "intersex"}
                <IconIntersex size={14} strokeWidth={2} className="gender-icon" />
              {:else if genderIcon(npc.gender) === "transgender"}
                <IconTransgender size={14} strokeWidth={2} className="gender-icon" />
              {/if}
            </div>
            <div class="npc-race">{npc.race}{npc.gender ? ` · ${npc.gender}` : ""}</div>
          </div>
          <div class="npc-header-actions">
            <button
              class="npc-edit-btn icon"
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
            </button>
            <button
              class="npc-edit-btn danger icon"
              onclick={() => deleteNpc(npc)}
              disabled={savingNpc || deletingNpcName !== null || !$currentStoryId}
              title="Delete NPC"
              aria-label="Delete NPC"
            >
              <IconTrash size={12} strokeWidth={2} className="npc-trash-icon" />
            </button>
          </div>
        </div>

        {#if editingNpcName === npc.name}
          <div class="npc-edit">
            <EditableFieldList fields={npcEditFields(npc)} />
            <div class="npc-edit-actions">
              <button class="btn-ghost" onclick={cancelNpcEdit} disabled={savingNpc}>Cancel</button>
              <button class="btn-primary" onclick={saveNpcEdit} disabled={savingNpc || !$currentStoryId}>
                {savingNpc ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        {:else}
          {#if useNpcLocation}
            <div class="npc-detail-row">
              <IconMapPin size={13} strokeWidth={1.5} className="npc-icon" />
              <span>{npc.current_location}</span>
            </div>
          {/if}

          <div class="npc-detail-row">
            <IconDocument size={13} strokeWidth={1.5} className="npc-icon" />
            <span>{npc.general_description || "Unknown description"}</span>
          </div>

          {#if useNpcAppearance}
            {#if showBaselineDetails}
              <div class="npc-detail-row">
                <IconFace size={13} strokeWidth={1.5} className="npc-icon" />
                <span>{npc.baseline_appearance}</span>
              </div>
            {/if}

            <div class="npc-detail-row">
              <IconFace size={13} strokeWidth={1.5} className="npc-icon" />
              <span class="npc-diff">
                {#each getDiffSegments(npc.baseline_appearance, npc.current_appearance) as segment}
                  <span class:diff-added={segment.added}>{segment.text}</span>
                {/each}
              </span>
            </div>

            <div class="npc-detail-row muted">
              <IconShirt size={13} strokeWidth={1.5} className="npc-icon" />
              <span>{npc.current_clothing}</span>
            </div>
          {/if}

          {#if useNpcActivity}
            <div class="npc-detail-row">
              <IconDocument size={13} strokeWidth={1.5} className="npc-icon" />
              <span>{npc.current_activity}</span>
            </div>
          {/if}

          {#if (useNpcPersonalityTraits && npc.personality_traits.length > 0) || (useNpcMajorFlaws && npc.major_flaws.length > 0) || (useNpcQuirks && npc.quirks.length > 0) || (useNpcPerks && npc.perks.length > 0)}
            <div class="npc-traits">
              <IconStar size={13} strokeWidth={1.5} className="npc-icon npc-traits-icon" />
              <div class="chips">
                {#if useNpcPersonalityTraits}
                  {#each npc.personality_traits as trait}
                    <span class="chip">{trait}</span>
                  {/each}
                {/if}
                {#if useNpcMajorFlaws}
                  {#each npc.major_flaws as trait}
                    <span class="chip">{trait}</span>
                  {/each}
                {/if}
                {#if useNpcQuirks}
                  {#each npc.quirks as trait}
                    <span class="chip">{trait}</span>
                  {/each}
                {/if}
                {#if useNpcPerks}
                  {#each npc.perks as trait}
                    <span class="chip">{trait}</span>
                  {/each}
                {/if}
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/each}
  {/if}
{/snippet}

{#if inline}
  <div class="sidebar">
    <div class="sidebar-header">
      <IconUsers size={16} strokeWidth={1.5} className="npc-header-icon" />
      <span>Known NPCs ({$npcs.length})</span>
      {#if useNpcAppearance}
        <button
          class="npc-toggle-btn"
          onclick={() => (showBaselineDetails = !showBaselineDetails)}
          disabled={$npcs.length === 0}
        >
          {showBaselineDetails ? "Hide Baseline" : "Show Baseline"}
        </button>
      {/if}
    </div>
    <div class="sidebar-body" data-scroll-root="modal" bind:this={sidebarBodyEl}>
      {@render npcContent()}
    </div>
  </div>
{:else if $showNPCTracker}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => showNPCTracker.set(false)}></div>
  <div class="panel">
    <div class="panel-header">
      <IconUsers size={16} strokeWidth={1.5} className="npc-header-icon" />
      <span>Known NPCs ({$npcs.length})</span>
      {#if useNpcAppearance}
        <button
          class="npc-toggle-btn"
          onclick={() => (showBaselineDetails = !showBaselineDetails)}
          disabled={$npcs.length === 0}
        >
          {showBaselineDetails ? "Hide Baseline" : "Show Baseline"}
        </button>
      {/if}
      <button onclick={() => showNPCTracker.set(false)}>×</button>
    </div>
    <div class="panel-body" data-scroll-root="modal" bind:this={panelBodyEl}>
      {@render npcContent()}
    </div>
  </div>
{/if}

<style>
  /* ── Desktop sidebar ──────────────────────────────── */
  .sidebar {
    border-left: 1px solid var(--border);
  }

  /* ── Header icon ───────────────────────────────────── */
  :global(.npc-header-icon) {
    color: var(--text);
    flex-shrink: 0;
    margin-right: 0.4rem;
    opacity: 0.6;
  }
  .npc-toggle-btn {
    margin-left: auto;
    background: transparent;
    border: 1px dashed var(--border);
    color: var(--text-dim);
    border-radius: var(--radius-pill);
    padding: 0.2rem 0.6rem;
    font-size: 0.62rem;
    letter-spacing: 0.08em;
    min-width: auto;
    min-height: auto;
  }
  .npc-toggle-btn:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .npc-toggle-btn:disabled {
    opacity: 0.5;
  }

  /* ── Shared content styles ────────────────────────── */
  .sidebar-body,
  .panel-body {
    padding: 0.75rem;
    gap: 0.75rem;
  }

  .npc-add {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .npc-add-input {
    flex: 1;
    width: auto;
  }

  .npc-add-btn {
    flex-shrink: 0;
  }

  /* ── NPC Card ──────────────────────────────────────── */
  .npc-card {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.65rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .npc-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .npc-header-actions {
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }

  .npc-edit-btn {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: var(--radius-pill);
    padding: 0.2rem 0.55rem;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
  }
  .npc-edit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .npc-edit-btn.danger {
    border-color: #8b2b2b;
    color: #c65a5a;
  }
  .npc-edit-btn.danger:hover:not(:disabled) {
    border-color: #c0392b;
    color: #c0392b;
  }

  .npc-edit-btn.icon {
    padding: 0.2rem 0.35rem;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }

  :global(.npc-trash-icon) {
    color: currentColor;
  }

  .npc-identity {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .npc-name {
    font-weight: 600;
    font-family: var(--font-story);
    color: var(--text);
    font-size: 1rem;
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  :global(.gender-icon) {
    color: var(--text);
    flex-shrink: 0;
    opacity: 0.5;
  }
  .npc-race {
    font-size: 0.8rem;
    color: var(--text-dim);
    font-style: italic;
  }

  /* ── Detail rows with icons ────────────────────────── */
  .npc-detail-row {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.85rem;
    color: var(--text);
    line-height: 1.4;
  }
  .npc-detail-row.muted {
    color: var(--text-dim);
    font-style: italic;
  }

  .npc-diff {
    display: inline;
  }

  .npc-diff .diff-added {
    color: var(--accent, var(--text));
    font-weight: 700;
  }

  :global(.npc-icon) {
    color: var(--text);
    flex-shrink: 0;
    margin-top: 2px;
    opacity: 0.35;
  }

  .npc-edit {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    margin-top: 0.5rem;
  }

  .npc-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
  }

  .npc-traits {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    margin-top: 0.1rem;
  }

  .npc-traits :global(.chips) {
    gap: 0.35rem;
  }

  :global(.npc-traits-icon) {
    margin-top: 2px;
    opacity: 0.45;
  }
</style>
