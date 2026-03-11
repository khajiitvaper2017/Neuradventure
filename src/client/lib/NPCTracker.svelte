<script lang="ts">
  import { api, ApiError } from "../api/client.js"
  import { showNPCTracker, showError, showQuietNotice } from "../stores/ui.js"
  import { currentStoryId, npcs, llmUpdateId, isGenerating, markLlmUpdate } from "../stores/game.js"
  import type { NPCState } from "../api/client.js"
  import { autoresize } from "./actions/autoresize.js"
  import { genderIcon, splitCsv } from "./utils/text.js"
  import IconMale from "../icons/IconMale.svelte"
  import IconFemale from "../icons/IconFemale.svelte"
  import IconIntersex from "../icons/IconIntersex.svelte"
  import IconTransgender from "../icons/IconTransgender.svelte"
  import IconFace from "../icons/IconFace.svelte"
  import IconShirt from "../icons/IconShirt.svelte"
  import IconDocument from "../icons/IconDocument.svelte"
  import IconMapPin from "../icons/IconMapPin.svelte"
  import IconStar from "../icons/IconStar.svelte"
  import IconUsers from "../icons/IconUsers.svelte"

  let { inline = false }: { inline?: boolean } = $props()

  const RELATIONSHIP_COLORS: Record<string, string> = {
    hostile: "#c0392b",
    ally: "#27ae60",
    friendly: "#2980b9",
    neutral: "#888",
  }

  function relationshipColor(rel: string): string {
    const key = rel.toLowerCase()
    for (const [k, v] of Object.entries(RELATIONSHIP_COLORS)) {
      if (key.includes(k)) return v
    }
    return "#888"
  }

  function npcFieldId(npc: NPCState, field: string): string {
    const base = npc.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "")
    return `npc-${field}-${base || "unknown"}`
  }

  type FieldKind = "input" | "textarea"
  type EditField = {
    id: string
    label: string
    kind: FieldKind
    value: string
    onInput: (value: string) => void
  }

  function updateField(field: EditField, event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement
    field.onInput(target.value)
  }

  function npcEditFields(npc: NPCState): EditField[] {
    return [
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
      {
        id: npcFieldId(npc, "relationship"),
        label: "Relationship",
        kind: "input",
        value: draft.relationship,
        onInput: (v) => (draft.relationship = v),
      },
      {
        id: npcFieldId(npc, "location"),
        label: "Last Known Location",
        kind: "input",
        value: draft.location,
        onInput: (v) => (draft.location = v),
      },
      {
        id: npcFieldId(npc, "appearance"),
        label: "Appearance",
        kind: "textarea",
        value: draft.appearance,
        onInput: (v) => (draft.appearance = v),
      },
      {
        id: npcFieldId(npc, "clothing"),
        label: "Clothing",
        kind: "textarea",
        value: draft.clothing,
        onInput: (v) => (draft.clothing = v),
      },
      {
        id: npcFieldId(npc, "traits"),
        label: "Traits (comma separated)",
        kind: "input",
        value: draft.traits,
        onInput: (v) => (draft.traits = v),
      },
      {
        id: npcFieldId(npc, "notes"),
        label: "Notes",
        kind: "textarea",
        value: draft.notes,
        onInput: (v) => (draft.notes = v),
      },
    ]
  }

  function startNpcEdit(npc: NPCState) {
    editingNpcName = npc.name
    draft = {
      name: npc.name,
      race: npc.race,
      gender: npc.gender,
      relationship: npc.relationship_to_player,
      location: npc.last_known_location,
      appearance: npc.appearance.physical_description,
      clothing: npc.appearance.current_clothing,
      notes: npc.notes ?? "",
      traits: npc.personality_traits.join(", "),
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
    const gender = draft.gender.trim()
    const relationship = draft.relationship.trim()
    const location = draft.location.trim()
    const appearance = draft.appearance.trim()
    const clothing = draft.clothing.trim()
    const notes = draft.notes.trim() || "None"
    if (!name || !race || !gender || !relationship || !location || !appearance || !clothing) {
      showError("Name, race, gender, relationship, location, appearance, and clothing are required.")
      return
    }
    const traits = splitCsv(draft.traits)
    const updatedNpc: NPCState = {
      name,
      race,
      gender,
      relationship_to_player: relationship,
      last_known_location: location,
      appearance: { physical_description: appearance, current_clothing: clothing },
      personality_traits: traits,
      notes,
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
  type NpcDraft = {
    name: string
    race: string
    gender: string
    relationship: string
    location: string
    appearance: string
    clothing: string
    notes: string
    traits: string
  }
  let draft = $state<NpcDraft>({
    name: "",
    race: "",
    gender: "",
    relationship: "",
    location: "",
    appearance: "",
    clothing: "",
    notes: "",
    traits: "",
  })

  function createRequestId(): string {
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return crypto.randomUUID()
    }
    return `req_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`
  }

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
      const result = await api.turns.createNpc($currentStoryId, name, "do", createRequestId())
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
      npc.relationship_to_player,
      npc.last_known_location,
      npc.appearance.physical_description,
      npc.appearance.current_clothing,
      npc.notes ?? "",
    ].join("|")
  }

  function triggerNpcFlash(names: string[]) {
    flashNpcNames = names
    if (flashTimer) window.clearTimeout(flashTimer)
    flashTimer = window.setTimeout(() => {
      flashNpcNames = []
    }, 900)
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
            <div
              class="npc-rel-badge"
              style="color: {relationshipColor(npc.relationship_to_player)}; border-color: {relationshipColor(
                npc.relationship_to_player,
              )}"
            >
              {npc.relationship_to_player}
            </div>
            <button
              class="npc-edit-btn"
              onclick={() => startNpcEdit(npc)}
              disabled={savingNpc ||
                editingNpcName === npc.name ||
                (editingNpcName && editingNpcName !== npc.name) ||
                !$currentStoryId}
            >
              {editingNpcName === npc.name ? "Editing" : "Edit"}
            </button>
          </div>
        </div>

        {#if editingNpcName === npc.name}
          <div class="npc-edit">
            {#each npcEditFields(npc) as field}
              <div class="field">
                <label for={field.id}>{field.label}</label>
                {#if field.kind === "textarea"}
                  <textarea
                    id={field.id}
                    value={field.value}
                    oninput={(e) => updateField(field, e)}
                    use:autoresize={field.value}
                  ></textarea>
                {:else}
                  <input id={field.id} type="text" value={field.value} oninput={(e) => updateField(field, e)} />
                {/if}
              </div>
            {/each}
            <div class="npc-edit-actions">
              <button class="btn-ghost" onclick={cancelNpcEdit} disabled={savingNpc}>Cancel</button>
              <button class="btn-primary" onclick={saveNpcEdit} disabled={savingNpc || !$currentStoryId}>
                {savingNpc ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        {:else}
          <div class="npc-detail-row">
            <IconMapPin size={13} strokeWidth={1.5} className="npc-icon" />
            <span>{npc.last_known_location}</span>
          </div>

          <div class="npc-detail-row">
            <IconFace size={13} strokeWidth={1.5} className="npc-icon" />
            <span>{npc.appearance.physical_description}</span>
          </div>

          <div class="npc-detail-row muted">
            <IconShirt size={13} strokeWidth={1.5} className="npc-icon" />
            <span>{npc.appearance.current_clothing}</span>
          </div>

          {#if npc.personality_traits.length > 0}
            <div class="npc-traits">
              <IconStar size={13} strokeWidth={1.5} className="npc-icon npc-traits-icon" />
              <div class="chips">
                {#each npc.personality_traits as trait}
                  <span class="chip">{trait}</span>
                {/each}
              </div>
            </div>
          {/if}

          {#if npc.notes}
            <div class="npc-notes">
              <IconDocument size={13} strokeWidth={1.5} className="npc-icon npc-notes-icon" />
              <span>{npc.notes}</span>
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
    text-transform: uppercase;
  }
  .npc-edit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
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

  .npc-rel-badge {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    border: 1px solid;
    border-radius: var(--radius-pill);
    padding: 0.15rem 0.5rem;
    white-space: nowrap;
    flex-shrink: 0;
    margin-top: 0.1rem;
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

  .npc-notes {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
    font-size: 0.8rem;
    color: var(--text-dim);
    margin-top: 0.15rem;
    border-top: 1px solid var(--border);
    padding-top: 0.4rem;
    line-height: 1.4;
  }
  :global(.npc-notes-icon) {
    margin-top: 1px;
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
