<script lang="ts">
  import { showCharSheet } from "../stores/ui.js"
  import { character } from "../stores/game.js"
</script>

{#if $showCharSheet}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => showCharSheet.set(false)}></div>
  <div class="panel">
    <div class="panel-header">
      <span>Character Sheet</span>
      <button onclick={() => showCharSheet.set(false)}>×</button>
    </div>
    {#if $character}
      <div class="panel-body" data-scroll-root="modal">
        <div class="section-label">Identity</div>
        <div class="value">{$character.name} · {$character.race} · {$character.gender}</div>

        <div class="section-label">Appearance</div>
        <div class="value">{$character.appearance.physical_description}</div>

        <div class="section-label">Wearing</div>
        <div class="value">{$character.appearance.current_clothing}</div>

        {#if $character.personality_traits.length > 0 || $character.custom_traits.length > 0}
          <div class="section-label">Traits</div>
          <div class="chips">
            {#each [...$character.personality_traits, ...$character.custom_traits] as t}
              <span class="chip">{t}</span>
            {/each}
          </div>
        {/if}

        <div class="section-label">Inventory ({$character.inventory.length})</div>
        {#if $character.inventory.length === 0}
          <div class="value muted">Nothing</div>
        {:else}
          <ul class="inventory">
            {#each $character.inventory as item}
              <li>
                <span class="item-name">{item.name}</span>
                <span class="item-desc">{item.description}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
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
  .panel-header button:hover { color: var(--text); }
  .panel-body {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  .section-label {
    font-size: 0.75rem;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: var(--text-dim);
    margin-top: 0.75rem;
  }
  .section-label:first-child { margin-top: 0; }
  .value {
    font-size: 0.9rem;
    color: var(--text);
    line-height: 1.5;
  }
  .value.muted { color: var(--text-dim); }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }
  .chip {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 20px;
    padding: 0.25rem 0.6rem;
    font-size: 0.8rem;
    color: var(--text-dim);
  }
  .inventory {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }
  .inventory li {
    display: flex;
    flex-direction: column;
  }
  .item-name {
    font-size: 0.9rem;
    color: var(--text);
  }
  .item-desc {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
</style>
