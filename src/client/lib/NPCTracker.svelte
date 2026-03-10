<script lang="ts">
  import { showNPCTracker } from "../stores/ui.js"
  import { npcs } from "../stores/game.js"

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

{#if $showNPCTracker}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => showNPCTracker.set(false)}></div>
  <div class="panel">
    <div class="panel-header">
      <span>Known NPCs ({$npcs.length})</span>
      <button onclick={() => showNPCTracker.set(false)}>×</button>
    </div>
    <div class="panel-body" data-scroll-root="modal">
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
    </div>
  </div>
{/if}

<style>
  .overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    z-index: 20;
  }
  .panel {
    position: fixed;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(300px, 88vw);
    background: var(--bg-raised);
    border-left: 1px solid var(--border);
    z-index: 21;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.85rem 1rem;
    border-bottom: 1px solid var(--border);
    font-family: var(--font-brand);
    font-size: 0.78rem;
    font-weight: 400;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--text-dim);
  }
  .panel-header button {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 1.2rem;
    line-height: 1;
    min-width: 40px;
    min-height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .panel-header button:hover {
    color: var(--text);
  }
  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .empty {
    text-align: center;
    color: var(--text-dim);
    padding: 2rem 0;
    font-size: 0.9rem;
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
