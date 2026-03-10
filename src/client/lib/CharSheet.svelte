<script lang="ts">
  import { showCharSheet } from "../stores/ui.js"
  import { character, llmUpdateId } from "../stores/game.js"
  import type { MainCharacterState } from "../api/client.js"
  import IconMale from "../icons/IconMale.svelte"
  import IconFemale from "../icons/IconFemale.svelte"
  import IconFace from "../icons/IconFace.svelte"
  import IconShirt from "../icons/IconShirt.svelte"
  import IconStar from "../icons/IconStar.svelte"
  import IconCube from "../icons/IconCube.svelte"
  import IconDotSmall from "../icons/IconDotSmall.svelte"
  import IconDocument from "../icons/IconDocument.svelte"

  let { inline = false }: { inline?: boolean } = $props()

  function genderIcon(gender: string | undefined): "male" | "female" | null {
    if (!gender) return null
    const g = gender.toLowerCase()
    if (g.includes("female")) return "female"
    if (g.includes("male")) return "male"
    return null
  }

  type CharacterSigs = {
    identity: string
    appearance: string
    clothing: string
    traits: string
    inventory: string
  }

  let lastSigs: CharacterSigs | null = null
  let lastLlmUpdateId = 0
  let flashIdentity = $state(false)
  let flashAppearance = $state(false)
  let flashClothing = $state(false)
  let flashTraits = $state(false)
  let flashInventory = $state(false)
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

{#snippet charContent()}
  {#if $character}
    <div class="cs-section cs-identity" class:flash={flashIdentity}>
      <div class="cs-identity-name">
        {$character.name}
        {#if genderIcon($character.gender) === "male"}
          <IconMale size={14} strokeWidth={2} className="gender-icon" />
        {:else if genderIcon($character.gender) === "female"}
          <IconFemale size={14} strokeWidth={2} className="gender-icon" />
        {/if}
      </div>
      <div class="cs-identity-detail">{$character.race}{$character.gender ? ` · ${$character.gender}` : ''}</div>
    </div>

    <div class="cs-section" class:flash={flashAppearance}>
      <div class="cs-section-header">
        <IconFace size={14} strokeWidth={1.5} className="cs-icon" />
        <span class="section-label">Appearance</span>
      </div>
      <div class="cs-value">{$character.appearance.physical_description}</div>
    </div>

    <div class="cs-section" class:flash={flashClothing}>
      <div class="cs-section-header">
        <IconShirt size={14} strokeWidth={1.5} className="cs-icon" />
        <span class="section-label">Wearing</span>
      </div>
      <div class="cs-value">{$character.appearance.current_clothing}</div>
    </div>

    {#if $character.personality_traits.length > 0 || $character.custom_traits.length > 0}
      <div class="cs-section" class:flash={flashTraits}>
        <div class="cs-section-header">
          <IconStar size={14} strokeWidth={1.5} className="cs-icon" />
          <span class="section-label">Traits</span>
        </div>
        <div class="chips">
          {#each [...$character.personality_traits, ...$character.custom_traits] as t}
            <span class="chip">{t}</span>
          {/each}
        </div>
      </div>
    {/if}

    <div class="cs-section" class:flash={flashInventory}>
      <div class="cs-section-header">
        <IconCube size={14} strokeWidth={1.5} className="cs-icon" />
        <span class="section-label">Inventory ({$character.inventory.length})</span>
      </div>
      {#if $character.inventory.length === 0}
        <div class="cs-value muted">Nothing</div>
      {:else}
        <ul class="cs-inventory">
          {#each $character.inventory as item}
            <li>
              <IconDotSmall size={12} strokeWidth={1.5} className="cs-item-icon" />
              <div class="cs-item-text">
                <span class="cs-item-name">{item.name}</span>
                <span class="cs-item-desc">{item.description}</span>
              </div>
            </li>
          {/each}
        </ul>
      {/if}
    </div>
  {:else}
    <div class="empty">No active character</div>
  {/if}
{/snippet}

{#if inline}
  <div class="sidebar">
    <div class="sidebar-header">
      <IconDocument size={16} strokeWidth={1.5} className="cs-header-icon" />
      <span>Character Sheet</span>
    </div>
    <div class="sidebar-body" data-scroll-root="modal">
      {@render charContent()}
    </div>
  </div>
{:else if $showCharSheet}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={() => showCharSheet.set(false)}></div>
  <div class="panel">
    <div class="panel-header">
      <IconDocument size={16} strokeWidth={1.5} className="cs-header-icon" />
      <span>Character Sheet</span>
      <button onclick={() => showCharSheet.set(false)}>×</button>
    </div>
    <div class="panel-body" data-scroll-root="modal">
      {@render charContent()}
    </div>
  </div>
{/if}

<style>
  /* ── Desktop sidebar ──────────────────────────────── */
  .sidebar {
    border-right: 1px solid var(--border);
  }

  /* ── Header icon ───────────────────────────────────── */
  :global(.cs-header-icon) {
    color: var(--text);
    flex-shrink: 0;
    margin-right: 0.4rem;
    opacity: 0.6;
  }

  /* ── Sections ──────────────────────────────────────── */
  .cs-section {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.65rem 0.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  .cs-section-header {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }

  /* ── Identity ──────────────────────────────────────── */
  .cs-identity-name {
    font-family: var(--font-story);
    font-size: 1.05rem;
    font-weight: 600;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 0.35rem;
  }
  :global(.gender-icon) {
    color: var(--text);
    flex-shrink: 0;
    opacity: 0.5;
  }
  .cs-identity-detail {
    font-size: 0.85rem;
    color: var(--text-dim);
  }

  .cs-section-header .section-label {
    margin-top: 0;
  }

  /* ── Section icon ──────────────────────────────────── */
  :global(.cs-icon) {
    color: var(--text);
    flex-shrink: 0;
    opacity: 0.45;
  }

  /* ── Values ────────────────────────────────────────── */
  .cs-value {
    font-size: 0.9rem;
    color: var(--text);
    line-height: 1.5;
  }
  .cs-value.muted {
    color: var(--text-dim);
  }

  /* ── Inventory ─────────────────────────────────────── */
  .cs-inventory {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }
  .cs-inventory li {
    display: flex;
    align-items: flex-start;
    gap: 0.4rem;
  }
  :global(.cs-item-icon) {
    color: var(--text);
    flex-shrink: 0;
    margin-top: 3px;
    opacity: 0.35;
  }
  .cs-item-text {
    display: flex;
    flex-direction: column;
  }
  .cs-item-name {
    font-size: 0.9rem;
    color: var(--text);
  }
  .cs-item-desc {
    font-size: 0.8rem;
    color: var(--text-dim);
  }
</style>
