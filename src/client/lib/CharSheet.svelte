<script lang="ts">
  import { showCharSheet } from "../stores/ui.js"
  import { character, llmUpdateId } from "../stores/game.js"
  import type { MainCharacterState } from "../api/client.js"

  let { inline = false }: { inline?: boolean } = $props()

  type CharacterSigs = {
    identity: string
    appearance: string
    clothing: string
    traits: string
    inventory: string
  }

  let lastSigs: CharacterSigs | null = null
  let lastLlmUpdateId = 0
  let flashIdentity = false
  let flashAppearance = false
  let flashClothing = false
  let flashTraits = false
  let flashInventory = false
  let identityTimer: number | null = null
  let appearanceTimer: number | null = null
  let clothingTimer: number | null = null
  let traitsTimer: number | null = null
  let inventoryTimer: number | null = null

  function buildCharacterSigs(c: MainCharacterState): CharacterSigs {
    return {
      identity: `${c.name}|${c.race}|${c.gender}`,
      appearance: c.appearance?.physical_description ?? "",
      clothing: c.appearance?.current_clothing ?? "",
      traits: [...c.personality_traits, ...c.custom_traits].join("|"),
      inventory: c.inventory.map((item) => `${item.name}:${item.description}`).join("|"),
    }
  }

  function triggerFlash(kind: "identity" | "appearance" | "clothing" | "traits" | "inventory") {
    if (kind === "identity") {
      flashIdentity = true
      if (identityTimer) window.clearTimeout(identityTimer)
      identityTimer = window.setTimeout(() => (flashIdentity = false), 900)
      return
    }
    if (kind === "appearance") {
      flashAppearance = true
      if (appearanceTimer) window.clearTimeout(appearanceTimer)
      appearanceTimer = window.setTimeout(() => (flashAppearance = false), 900)
      return
    }
    if (kind === "clothing") {
      flashClothing = true
      if (clothingTimer) window.clearTimeout(clothingTimer)
      clothingTimer = window.setTimeout(() => (flashClothing = false), 900)
      return
    }
    if (kind === "traits") {
      flashTraits = true
      if (traitsTimer) window.clearTimeout(traitsTimer)
      traitsTimer = window.setTimeout(() => (flashTraits = false), 900)
      return
    }
    flashInventory = true
    if (inventoryTimer) window.clearTimeout(inventoryTimer)
    inventoryTimer = window.setTimeout(() => (flashInventory = false), 900)
  }

  $effect(() => {
    if (!lastSigs && $character) {
      lastSigs = buildCharacterSigs($character)
    }
  })

  $effect(() => {
    if ($llmUpdateId !== lastLlmUpdateId) {
      if ($character) {
        const nextSigs = buildCharacterSigs($character)
        if (lastSigs) {
          if (nextSigs.identity !== lastSigs.identity) triggerFlash("identity")
          if (nextSigs.appearance !== lastSigs.appearance) triggerFlash("appearance")
          if (nextSigs.clothing !== lastSigs.clothing) triggerFlash("clothing")
          if (nextSigs.traits !== lastSigs.traits) triggerFlash("traits")
          if (nextSigs.inventory !== lastSigs.inventory) triggerFlash("inventory")
        }
        lastSigs = nextSigs
      } else {
        lastSigs = null
      }
      lastLlmUpdateId = $llmUpdateId
    }
  })
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
        <div class="value" class:flash={flashIdentity}>
          {$character.name} · {$character.race} · {$character.gender}
        </div>

        <div class="section-label">Appearance</div>
        <div class="value" class:flash={flashAppearance}>{$character.appearance.physical_description}</div>

        <div class="section-label">Wearing</div>
        <div class="value" class:flash={flashClothing}>{$character.appearance.current_clothing}</div>

        {#if $character.personality_traits.length > 0 || $character.custom_traits.length > 0}
          <div class="section-label">Traits</div>
          <div class="chips" class:flash={flashTraits}>
            {#each [...$character.personality_traits, ...$character.custom_traits] as t}
              <span class="chip">{t}</span>
            {/each}
          </div>
        {/if}

        <div class="section-label">Inventory ({$character.inventory.length})</div>
        {#if $character.inventory.length === 0}
          <div class="value muted" class:flash={flashInventory}>Nothing</div>
        {:else}
          <ul class="inventory" class:flash={flashInventory}>
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
        <div class="value" class:flash={flashIdentity}>
          {$character.name} · {$character.race} · {$character.gender}
        </div>

        <div class="section-label">Appearance</div>
        <div class="value" class:flash={flashAppearance}>{$character.appearance.physical_description}</div>

        <div class="section-label">Wearing</div>
        <div class="value" class:flash={flashClothing}>{$character.appearance.current_clothing}</div>

        {#if $character.personality_traits.length > 0 || $character.custom_traits.length > 0}
          <div class="section-label">Traits</div>
          <div class="chips" class:flash={flashTraits}>
            {#each [...$character.personality_traits, ...$character.custom_traits] as t}
              <span class="chip">{t}</span>
            {/each}
          </div>
        {/if}

        <div class="section-label">Inventory ({$character.inventory.length})</div>
        {#if $character.inventory.length === 0}
          <div class="value muted" class:flash={flashInventory}>Nothing</div>
        {:else}
          <ul class="inventory" class:flash={flashInventory}>
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
