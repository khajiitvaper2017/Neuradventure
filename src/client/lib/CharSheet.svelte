<script lang="ts">
  import { showCharSheet } from "../stores/ui.js"
  import { character } from "../stores/game.js"

  let { inline = false }: { inline?: boolean } = $props()
</script>

{#if inline}
  <!-- Desktop sidebar: always visible -->
  <div class="sidebar">
    <div class="sidebar-header">
      <span>Character Sheet</span>
    </div>
    {#if $character}
      <div class="sidebar-body" data-scroll-root="modal">
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
    {:else}
      <div class="sidebar-body">
        <div class="empty">No active character</div>
      </div>
    {/if}
  </div>
{:else if $showCharSheet}
  <!-- Mobile overlay -->
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
  /* ── Desktop sidebar ──────────────────────────────── */
  .sidebar {
    border-right: 1px solid var(--border);
  }
  /* ── Shared content styles ────────────────────────── */
  .section-label {
    margin-top: 0.75rem;
  }
  .section-label:first-child {
    margin-top: 0;
  }
  .value {
    font-size: 0.9rem;
    color: var(--text);
    line-height: 1.5;
  }
  .value.muted {
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
