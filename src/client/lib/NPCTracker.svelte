<script lang="ts">
  import { showNPCTracker } from "../stores/ui.js"
  import { npcs } from "../stores/game.js"

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
</script>

{#snippet npcContent()}
  {#if $npcs.length === 0}
    <div class="empty">No known characters yet.</div>
  {:else}
    {#each $npcs as npc}
      <div class="npc-card">
        <div class="npc-name">{npc.name}</div>
        <div class="npc-race">{npc.race}</div>
        <div class="npc-rel" style="color: {relationshipColor(npc.relationship_to_player)}">
          {npc.relationship_to_player}
        </div>
        <div class="npc-detail">📍 {npc.last_known_location}</div>
        <div class="npc-detail">{npc.appearance.physical_description}</div>
        <div class="npc-detail muted">{npc.appearance.current_clothing}</div>
        {#if npc.notes}
          <div class="npc-notes">{npc.notes}</div>
        {/if}
      </div>
    {/each}
  {/if}
{/snippet}

{#if inline}
  <!-- Desktop sidebar: always visible -->
  <div class="sidebar">
    <div class="sidebar-header">
      <span>Known NPCs ({$npcs.length})</span>
    </div>
    <div class="sidebar-body" data-scroll-root="modal">
      {@render npcContent()}
    </div>
  </div>
{:else if $showNPCTracker}
  <!-- Mobile overlay -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => showNPCTracker.set(false)}></div>
  <div class="panel">
    <div class="panel-header">
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

  /* ── Shared content styles ────────────────────────── */
  .sidebar-body,
  .panel-body {
    padding: 0.75rem;
    gap: 0.75rem;
  }
  .npc-card {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }
  .npc-name {
    font-weight: 600;
    font-family: var(--font-story);
    color: var(--text);
    font-size: 1rem;
  }
  .npc-race {
    font-size: 0.8rem;
    color: var(--text-dim);
    font-style: italic;
  }
  .npc-rel {
    font-size: 0.8rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .npc-detail {
    font-size: 0.85rem;
    color: var(--text);
    line-height: 1.4;
  }
  .npc-detail.muted {
    color: var(--text-dim);
    font-style: italic;
  }
  .npc-notes {
    font-size: 0.8rem;
    color: var(--text-dim);
    margin-top: 0.25rem;
    border-top: 1px solid var(--border);
    padding-top: 0.4rem;
    line-height: 1.4;
  }
</style>
