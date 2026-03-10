<script lang="ts">
  import { showNPCTracker } from "../stores/ui.js"
  import { npcs, llmUpdateId } from "../stores/game.js"
  import type { NPCState } from "../api/client.js"
  import IconMale from "../icons/IconMale.svelte"
  import IconFemale from "../icons/IconFemale.svelte"
  import IconFace from "../icons/IconFace.svelte"
  import IconShirt from "../icons/IconShirt.svelte"
  import IconDocument from "../icons/IconDocument.svelte"
  import IconMapPin from "../icons/IconMapPin.svelte"
  import IconUsers from "../icons/IconUsers.svelte"

  let { inline = false }: { inline?: boolean } = $props()

  const RELATIONSHIP_COLORS: Record<string, string> = {
    hostile: "#c0392b",
    ally: "#27ae60",
    friendly: "#2980b9",
    neutral: "#888",
  }

  function genderIcon(gender: string | undefined): "male" | "female" | null {
    if (!gender) return null
    const g = gender.toLowerCase()
    if (g.includes("female")) return "female"
    if (g.includes("male")) return "male"
    return null
  }

  function relationshipColor(rel: string): string {
    const key = rel.toLowerCase()
    for (const [k, v] of Object.entries(RELATIONSHIP_COLORS)) {
      if (key.includes(k)) return v
    }
    return "#888"
  }

  let lastNpcSigs = new Map<string, string>()
  let lastLlmUpdateId = 0
  let flashNpcNames = $state<string[]>([])
  let flashTimer: number | null = null

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

  $effect(() => {
    if (lastNpcSigs.size === 0 && $npcs.length > 0) {
      const initial = new Map<string, string>()
      for (const npc of $npcs) {
        initial.set(npc.name, npcSignature(npc))
      }
      lastNpcSigs = initial
    }
  })

  $effect(() => {
    if ($npcs.length === 0 && lastNpcSigs.size > 0) {
      lastNpcSigs = new Map<string, string>()
      flashNpcNames = []
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
      }
      lastNpcSigs = nextSigs
      lastLlmUpdateId = $llmUpdateId
    }
  })
</script>

{#snippet npcContent()}
  {#if $npcs.length === 0}
    <div class="empty">No known characters yet.</div>
  {:else}
    {#each $npcs as npc}
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
          <div
            class="npc-rel-badge"
            style="color: {relationshipColor(npc.relationship_to_player)}; border-color: {relationshipColor(
              npc.relationship_to_player,
            )}"
          >
            {npc.relationship_to_player}
          </div>
        </div>

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

        {#if npc.notes}
          <div class="npc-notes">
            <IconDocument size={13} strokeWidth={1.5} className="npc-icon npc-notes-icon" />
            <span>{npc.notes}</span>
          </div>
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
    <div class="sidebar-body" data-scroll-root="modal">
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
    <div class="panel-body" data-scroll-root="modal">
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
</style>
