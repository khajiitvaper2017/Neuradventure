<script lang="ts">
  import { api, ApiError } from "../api/client.js"
  import { showNPCTracker, showError, showQuietNotice } from "../stores/ui.js"
  import { currentStoryId, npcs, llmUpdateId } from "../stores/game.js"
  import type { NPCState } from "../api/client.js"
  import { autoresize } from "./actions/autoresize.js"
  import { genderIcon, splitCsv } from "./utils/text.js"
  import IconMale from "../icons/IconMale.svelte"
  import IconFemale from "../icons/IconFemale.svelte"
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
    if (lastNpcSigs.size === 0 && $npcs.length > 0) {
      const initial = new Map<string, string>()
      const initialChangeIds = new Map<string, number>()
      for (const npc of $npcs) {
        initial.set(npc.name, npcSignature(npc))
        initialChangeIds.set(npc.name, 0)
      }
      lastNpcSigs = initial
      npcChangeIds = initialChangeIds
    }
  })

  $effect(() => {
    if ($npcs.length === 0 && lastNpcSigs.size > 0) {
      lastNpcSigs = new Map<string, string>()
      flashNpcNames = []
      npcChangeIds = new Map<string, number>()
    }
  })

  $effect(() => {
    if ($npcs.length === 0) {
      sortedNpcs = []
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
    if (updated) {
      npcChangeIds = nextChangeIds
    }
  })

  $effect(() => {
    if ($npcs.length === 0) {
      sortedNpcs = []
      return
    }
    sortedNpcs = sortByLatestChange($npcs, npcChangeIds)
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
            <div class="field">
              <label for={npcFieldId(npc, "name")}>Name</label>
              <input id={npcFieldId(npc, "name")} type="text" bind:value={draft.name} />
            </div>
            <div class="field">
              <label for={npcFieldId(npc, "race")}>Race</label>
              <input id={npcFieldId(npc, "race")} type="text" bind:value={draft.race} />
            </div>
            <div class="field">
              <label for={npcFieldId(npc, "gender")}>Gender</label>
              <input id={npcFieldId(npc, "gender")} type="text" bind:value={draft.gender} />
            </div>
            <div class="field">
              <label for={npcFieldId(npc, "relationship")}>Relationship</label>
              <input id={npcFieldId(npc, "relationship")} type="text" bind:value={draft.relationship} />
            </div>
            <div class="field">
              <label for={npcFieldId(npc, "location")}>Last Known Location</label>
              <input id={npcFieldId(npc, "location")} type="text" bind:value={draft.location} />
            </div>
            <div class="field">
              <label for={npcFieldId(npc, "appearance")}>Appearance</label>
              <textarea id={npcFieldId(npc, "appearance")} bind:value={draft.appearance} use:autoresize={draft.appearance}
              ></textarea>
            </div>
            <div class="field">
              <label for={npcFieldId(npc, "clothing")}>Clothing</label>
              <textarea id={npcFieldId(npc, "clothing")} bind:value={draft.clothing} use:autoresize={draft.clothing}
              ></textarea>
            </div>
            <div class="field">
              <label for={npcFieldId(npc, "traits")}>Traits (comma separated)</label>
              <input id={npcFieldId(npc, "traits")} type="text" bind:value={draft.traits} />
            </div>
            <div class="field">
              <label for={npcFieldId(npc, "notes")}>Notes</label>
              <textarea id={npcFieldId(npc, "notes")} bind:value={draft.notes} use:autoresize={draft.notes}></textarea>
            </div>
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
