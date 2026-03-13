<script lang="ts">
  import { onDestroy } from "svelte"
  import { api, ApiError } from "../../api/client.js"
  import {
    activeScreen,
    charSheetCharacterId,
    closeCharSheet,
    showCharSheet,
    showError,
    showQuietNotice,
  } from "../../stores/ui.js"
  import { character, currentStoryId, currentStoryModules, llmUpdateId } from "../../stores/game.js"
  import type { MainCharacterState } from "../../api/client.js"
  import { genderIcon, normalizeGender, splitCsv } from "../../utils/text.js"
  import EditableFieldList from "../../components/ui/EditableFieldList.svelte"
  import type { EditField } from "../../components/ui/editableFieldTypes.js"
  import IconMale from "../../components/icons/IconMale.svelte"
  import IconFemale from "../../components/icons/IconFemale.svelte"
  import IconIntersex from "../../components/icons/IconIntersex.svelte"
  import IconTransgender from "../../components/icons/IconTransgender.svelte"
  import IconFace from "../../components/icons/IconFace.svelte"
  import IconShirt from "../../components/icons/IconShirt.svelte"
  import IconStar from "../../components/icons/IconStar.svelte"
  import IconCube from "../../components/icons/IconCube.svelte"
  import IconDotSmall from "../../components/icons/IconDotSmall.svelte"
  import IconDocument from "../../components/icons/IconDocument.svelte"
  import IconPencilSquare from "../../components/icons/IconPencilSquare.svelte"

  let { inline = false }: { inline?: boolean } = $props()

  const isGameScreen = $derived($activeScreen === "game")
  const canEdit = $derived((inline || isGameScreen) && $currentStoryId !== null)

  let inspectCharacter = $state<MainCharacterState | null>(null)
  let inspectLoading = $state(false)
  let inspectError = $state<string | null>(null)
  let inspectRefresh = $state(0)
  let inspectFetchNonce = 0

  const isInspectMode = $derived(!inline && !isGameScreen && $showCharSheet && $charSheetCharacterId !== null)
  const displayCharacter = $derived(inline || isGameScreen ? $character : inspectCharacter)

  function retryInspect() {
    inspectRefresh += 1
  }

  type CharacterSigs = {
    identity: string
    generalDescription: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    inventory: string
  }

  let lastSigs: CharacterSigs | null = null
  let lastLlmUpdateId = 0
  let flashIdentity = $state(false)
  let flashAppearance = $state(false)
  let flashClothing = $state(false)
  let flashInventory = $state(false)
  let identityTimer: number | null = null
  let appearanceTimer: number | null = null
  let clothingTimer: number | null = null
  let inventoryTimer: number | null = null
  let editing = $state(false)
  let saving = $state(false)
  let showBaselineDetails = $state(false)
  const useAppearance = $derived($currentStoryModules?.character_appearance_clothing ?? true)
  const usePersonalityTraits = $derived($currentStoryModules?.character_personality_traits ?? true)
  const useMajorFlaws = $derived($currentStoryModules?.character_major_flaws ?? true)
  const useQuirks = $derived($currentStoryModules?.character_quirks ?? true)
  const usePerks = $derived($currentStoryModules?.character_perks ?? true)
  const useInventory = $derived($currentStoryModules?.character_inventory ?? true)
  const showTraitSection = $derived(usePersonalityTraits || useMajorFlaws || useQuirks || usePerks)

  type InventoryDraft = { name: string; description: string }
  type CharacterDraft = {
    name: string
    race: string
    gender: string
    generalDescription: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    personalityTraits: string
    majorFlaws: string
    quirks: string
    perks: string
    inventory: InventoryDraft[]
  }
  let draft = $state<CharacterDraft>({
    name: "",
    race: "",
    gender: "",
    generalDescription: "",
    baselineAppearance: "",
    currentAppearance: "",
    clothing: "",
    personalityTraits: "",
    majorFlaws: "",
    quirks: "",
    perks: "",
    inventory: [],
  })

  function buildCharacterSigs(c: MainCharacterState): CharacterSigs {
    return {
      identity: `${c.name}|${c.race}|${c.gender}`,
      generalDescription: c.general_description.trim(),
      baselineAppearance: c.baseline_appearance,
      currentAppearance: c.current_appearance,
      clothing: c.current_clothing,
      inventory: c.inventory.map((item) => `${item.name}:${item.description}`).join("|"),
    }
  }

  function triggerFlash(kind: "identity" | "appearance" | "clothing" | "inventory") {
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
    flashInventory = true
    if (inventoryTimer) window.clearTimeout(inventoryTimer)
    inventoryTimer = window.setTimeout(() => (flashInventory = false), 900)
  }

  function characterFields(): EditField[] {
    const fields: EditField[] = [
      { id: "cs-name", label: "Name", kind: "input", value: draft.name, onInput: (v) => (draft.name = v) },
      { id: "cs-race", label: "Race", kind: "input", value: draft.race, onInput: (v) => (draft.race = v) },
      { id: "cs-gender", label: "Gender", kind: "input", value: draft.gender, onInput: (v) => (draft.gender = v) },
    ]
    fields.push({
      id: "cs-description",
      label: "Description",
      kind: "textarea",
      value: draft.generalDescription,
      onInput: (v) => (draft.generalDescription = v),
    })

    if (useAppearance) {
      fields.push(
        {
          id: "cs-baseline-appearance",
          label: "Baseline Appearance",
          kind: "textarea",
          value: draft.baselineAppearance,
          onInput: (v) => (draft.baselineAppearance = v),
        },
        {
          id: "cs-current-appearance",
          label: "Current Appearance",
          kind: "textarea",
          value: draft.currentAppearance,
          onInput: (v) => (draft.currentAppearance = v),
        },
        {
          id: "cs-clothing",
          label: "Wearing",
          kind: "textarea",
          value: draft.clothing,
          onInput: (v) => (draft.clothing = v),
        },
      )
    }
    if (usePersonalityTraits) {
      fields.push({
        id: "cs-personality",
        label: "Personality Traits (comma separated)",
        kind: "input",
        value: draft.personalityTraits,
        onInput: (v) => (draft.personalityTraits = v),
      })
    }
    if (useMajorFlaws) {
      fields.push({
        id: "cs-major-flaws",
        label: "Major Flaws (comma separated)",
        kind: "input",
        value: draft.majorFlaws,
        onInput: (v) => (draft.majorFlaws = v),
      })
    }
    if (useQuirks) {
      fields.push({
        id: "cs-quirks",
        label: "Quirks (comma separated)",
        kind: "input",
        value: draft.quirks,
        onInput: (v) => (draft.quirks = v),
      })
    }
    if (usePerks) {
      fields.push({
        id: "cs-perks",
        label: "Perks (comma separated)",
        kind: "input",
        value: draft.perks,
        onInput: (v) => (draft.perks = v),
      })
    }
    return fields
  }

  function startEdit() {
    if (!canEdit) return
    if (!$character) return
    draft = {
      name: $character.name,
      race: $character.race,
      gender: $character.gender,
      generalDescription: $character.general_description ?? "",
      baselineAppearance: $character.baseline_appearance,
      currentAppearance: $character.current_appearance,
      clothing: $character.current_clothing,
      personalityTraits: $character.personality_traits.join(", "),
      majorFlaws: $character.major_flaws.join(", "),
      quirks: $character.quirks.join(", "),
      perks: $character.perks.join(", "),
      inventory: $character.inventory.map((item) => ({ name: item.name, description: item.description })),
    }
    editing = true
  }

  function cancelEdit() {
    editing = false
  }

  function addInventoryItem() {
    draft.inventory = [...draft.inventory, { name: "", description: "" }]
  }

  function updateInventoryItem(index: number, key: "name" | "description", value: string) {
    draft.inventory = draft.inventory.map((item, i) => (i === index ? { ...item, [key]: value } : item))
  }

  function removeInventoryItem(index: number) {
    draft.inventory = draft.inventory.filter((_, i) => i !== index)
  }

  async function saveCharacter() {
    if (!$currentStoryId) {
      showError("No active story to update.")
      return
    }
    const name = draft.name.trim()
    const race = draft.race.trim()
    const gender = normalizeGender(draft.gender, "")
    const generalDescription = draft.generalDescription.trim()
    const baselineAppearance = draft.baselineAppearance.trim()
    const currentAppearance = draft.currentAppearance.trim()
    const clothing = draft.clothing.trim()
    if (!name || !race || !gender) {
      showError("Name, race, and gender are required.")
      return
    }
    if (!generalDescription) {
      showError("Description is required.")
      return
    }
    const existing = $character
    const personalityTraits = usePersonalityTraits
      ? splitCsv(draft.personalityTraits)
      : (existing?.personality_traits ?? [])
    const majorFlaws = useMajorFlaws ? splitCsv(draft.majorFlaws) : (existing?.major_flaws ?? [])
    const quirks = useQuirks ? splitCsv(draft.quirks) : (existing?.quirks ?? [])
    const perks = usePerks ? splitCsv(draft.perks) : (existing?.perks ?? [])
    const inventory = useInventory
      ? draft.inventory
          .map((item) => ({ name: item.name.trim(), description: item.description.trim() }))
          .filter((item) => item.name.length > 0 || item.description.length > 0)
      : (existing?.inventory ?? [])
    if (useInventory) {
      for (const item of inventory) {
        if (!item.name || !item.description) {
          showError("Inventory items need both a name and description.")
          return
        }
      }
    }
    const nextCharacter: MainCharacterState = {
      name,
      race,
      gender,
      general_description: generalDescription,
      current_location: existing?.current_location ?? "",
      baseline_appearance: !useAppearance
        ? (existing?.baseline_appearance ?? "")
        : baselineAppearance || existing?.baseline_appearance || "",
      current_appearance: !useAppearance
        ? (existing?.current_appearance ?? "")
        : currentAppearance ||
          existing?.current_appearance ||
          baselineAppearance ||
          existing?.baseline_appearance ||
          "",
      current_clothing: !useAppearance
        ? (existing?.current_clothing ?? "")
        : clothing || existing?.current_clothing || "",
      personality_traits: personalityTraits.length > 0 ? personalityTraits : (existing?.personality_traits ?? []),
      major_flaws: majorFlaws.length > 0 ? majorFlaws : (existing?.major_flaws ?? []),
      quirks: quirks.length > 0 ? quirks : (existing?.quirks ?? []),
      perks: perks.length > 0 ? perks : (existing?.perks ?? []),
      inventory,
    }
    saving = true
    try {
      const result = await api.stories.updateState($currentStoryId, { character: nextCharacter })
      character.set(result.character)
      showQuietNotice("Character sheet updated.")
      editing = false
    } catch (err) {
      if (err instanceof ApiError) {
        showError(err.message)
      } else {
        showError("Failed to update character sheet.")
      }
    } finally {
      saving = false
    }
  }

  $effect(() => {
    if (!lastSigs && $character) {
      lastSigs = buildCharacterSigs($character)
    }
  })

  $effect(() => {
    if (!isInspectMode) {
      inspectCharacter = null
      inspectLoading = false
      inspectError = null
      return
    }
    const id = $charSheetCharacterId
    if (!id) return
    void inspectRefresh
    const nonce = ++inspectFetchNonce
    inspectLoading = true
    inspectError = null
    inspectCharacter = null
    ;(async () => {
      try {
        const result = await api.stories.getCharacter(id)
        if (nonce !== inspectFetchNonce) return
        inspectCharacter = result
      } catch (err) {
        if (nonce !== inspectFetchNonce) return
        if (err instanceof ApiError) {
          inspectError = err.message
        } else {
          inspectError = "Failed to load character."
        }
      } finally {
        if (nonce !== inspectFetchNonce) return
        inspectLoading = false
      }
    })()
  })

  $effect(() => {
    if ($llmUpdateId !== lastLlmUpdateId) {
      if ($character) {
        const nextSigs = buildCharacterSigs($character)
        if (lastSigs) {
          if (nextSigs.identity !== lastSigs.identity) triggerFlash("identity")
          if (nextSigs.generalDescription !== lastSigs.generalDescription) triggerFlash("appearance")
          if (
            useAppearance &&
            (nextSigs.baselineAppearance !== lastSigs.baselineAppearance ||
              nextSigs.currentAppearance !== lastSigs.currentAppearance)
          ) {
            triggerFlash("appearance")
          }
          if (useAppearance && nextSigs.clothing !== lastSigs.clothing) triggerFlash("clothing")
          if (useInventory && nextSigs.inventory !== lastSigs.inventory) triggerFlash("inventory")
        }
        lastSigs = nextSigs
      } else {
        lastSigs = null
      }
      lastLlmUpdateId = $llmUpdateId
    }
  })

  $effect(() => {
    if (!inline && !$showCharSheet && editing) {
      editing = false
    }
  })

  onDestroy(() => {
    if (identityTimer) window.clearTimeout(identityTimer)
    if (appearanceTimer) window.clearTimeout(appearanceTimer)
    if (clothingTimer) window.clearTimeout(clothingTimer)
    if (inventoryTimer) window.clearTimeout(inventoryTimer)
  })
</script>

{#snippet charContent()}
  {#if displayCharacter}
    {#if editing}
      <div class="cs-edit">
        <EditableFieldList fields={characterFields()} />
        {#if useInventory}
          <div class="field">
            <div class="label-row">
              <!-- svelte-ignore a11y_label_has_associated_control -->
              <label>Inventory</label>
              <button class="btn-ghost btn-mini" onclick={addInventoryItem} disabled={saving}>Add Item</button>
            </div>
            {#if draft.inventory.length === 0}
              <div class="cs-empty-edit">No items yet.</div>
            {:else}
              {#each draft.inventory as item, index}
                <div class="cs-inv-row">
                  <input
                    type="text"
                    value={item.name}
                    placeholder="Item name"
                    oninput={(e) => updateInventoryItem(index, "name", (e.target as HTMLInputElement).value)}
                  />
                  <input
                    type="text"
                    value={item.description}
                    placeholder="Description"
                    oninput={(e) => updateInventoryItem(index, "description", (e.target as HTMLInputElement).value)}
                  />
                  <button class="cs-inv-remove" onclick={() => removeInventoryItem(index)} aria-label="Remove item">
                    ×
                  </button>
                </div>
              {/each}
            {/if}
          </div>
        {/if}
        <div class="cs-edit-actions">
          <button class="btn-ghost" onclick={cancelEdit} disabled={saving}>Cancel</button>
          <button class="btn-primary" onclick={saveCharacter} disabled={saving || !$currentStoryId}>
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    {:else}
      <div class="cs-section cs-identity" class:flash={flashIdentity}>
        <div class="cs-identity-name">
          {displayCharacter.name}
          {#if genderIcon(displayCharacter.gender) === "male"}
            <IconMale size={14} strokeWidth={2} className="gender-icon" />
          {:else if genderIcon(displayCharacter.gender) === "female"}
            <IconFemale size={14} strokeWidth={2} className="gender-icon" />
          {:else if genderIcon(displayCharacter.gender) === "intersex"}
            <IconIntersex size={14} strokeWidth={2} className="gender-icon" />
          {:else if genderIcon(displayCharacter.gender) === "transgender"}
            <IconTransgender size={14} strokeWidth={2} className="gender-icon" />
          {/if}
        </div>
        <div class="cs-identity-detail">
          {displayCharacter.race}{displayCharacter.gender ? ` · ${displayCharacter.gender}` : ""}
        </div>
      </div>

        {#if showBaselineDetails}
      <div class="cs-section" class:flash={flashAppearance}>
        <div class="cs-section-header">
          <IconFace size={14} strokeWidth={1.5} className="cs-icon" />
          <span class="section-label">Description</span>
        </div>
        <div class="cs-value">{displayCharacter.general_description || "Unknown description"}</div>
      </div>
        {/if}

      {#if useAppearance}
        {#if showBaselineDetails}
          <div class="cs-section" class:flash={flashAppearance}>
            <div class="cs-section-header">
              <IconFace size={14} strokeWidth={1.5} className="cs-icon" />
              <span class="section-label">Baseline Appearance</span>
            </div>
            <div class="cs-value">{displayCharacter.baseline_appearance}</div>
          </div>
        {/if}

        <div class="cs-section" class:flash={flashAppearance}>
          <div class="cs-section-header">
            <IconFace size={14} strokeWidth={1.5} className="cs-icon" />
            <span class="section-label">Current Appearance</span>
          </div>
          <div class="cs-value">{displayCharacter.current_appearance}</div>
        </div>

        <div class="cs-section" class:flash={flashClothing}>
          <div class="cs-section-header">
            <IconShirt size={14} strokeWidth={1.5} className="cs-icon" />
            <span class="section-label">Wearing</span>
          </div>
          <div class="cs-value">{displayCharacter.current_clothing}</div>
        </div>
      {/if}

      {#if showTraitSection && ((usePersonalityTraits && displayCharacter.personality_traits.length > 0) || (useMajorFlaws && displayCharacter.major_flaws.length > 0) || (useQuirks && displayCharacter.quirks.length > 0) || (usePerks && displayCharacter.perks.length > 0))}
        <div class="cs-section">
          <div class="cs-section-header">
            <IconStar size={14} strokeWidth={1.5} className="cs-icon" />
            <span class="section-label">Traits · Flaws · Quirks · Perks</span>
          </div>
          <div class="chips">
            {#if usePersonalityTraits}
              {#each displayCharacter.personality_traits as t}
                <span class="chip">{t}</span>
              {/each}
            {/if}
            {#if useMajorFlaws}
              {#each displayCharacter.major_flaws as t}
                <span class="chip">{t}</span>
              {/each}
            {/if}
            {#if useQuirks}
              {#each displayCharacter.quirks as t}
                <span class="chip">{t}</span>
              {/each}
            {/if}
            {#if usePerks}
              {#each displayCharacter.perks as t}
                <span class="chip">{t}</span>
              {/each}
            {/if}
          </div>
        </div>
      {/if}

      {#if useInventory}
        <div class="cs-section" class:flash={flashInventory}>
          <div class="cs-section-header">
            <IconCube size={14} strokeWidth={1.5} className="cs-icon" />
            <span class="section-label">Inventory ({displayCharacter.inventory.length})</span>
          </div>
          {#if displayCharacter.inventory.length === 0}
            <div class="cs-value muted">Nothing</div>
          {:else}
            <ul class="cs-inventory">
              {#each displayCharacter.inventory as item}
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
      {/if}
    {/if}
  {:else}
    <div class="empty">No active character</div>
  {/if}
{/snippet}

{#if inline}
  <div class="sidebar">
    <div class="sidebar-header">
      <div class="cs-header-title">
        <IconDocument size={16} strokeWidth={1.5} className="cs-header-icon" />
        <span>Character Sheet</span>
      </div>
      <div class="cs-header-actions">
          <button
            class="cs-toggle-btn"
            onclick={() => (showBaselineDetails = !showBaselineDetails)}
            disabled={!displayCharacter}
          >
            {showBaselineDetails ? "Hide details" : "Show details"}
          </button>
        <button
          class="cs-edit-btn"
          onclick={startEdit}
          disabled={editing || !canEdit || !displayCharacter || saving}
          title="Edit character sheet"
          aria-label="Edit character sheet"
        >
          <IconPencilSquare size={12} strokeWidth={2} />
        </button>
      </div>
    </div>
    <div class="sidebar-body" data-scroll-root="modal">
      {@render charContent()}
    </div>
  </div>
{:else if $showCharSheet}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div class="overlay" onclick={closeCharSheet}></div>
  <div class="panel">
    <div class="panel-header">
      <div class="cs-header-title">
        <IconDocument size={16} strokeWidth={1.5} className="cs-header-icon" />
        <span>Character Sheet</span>
      </div>
      <div class="cs-header-actions">
          <button
            class="cs-toggle-btn"
            onclick={() => (showBaselineDetails = !showBaselineDetails)}
            disabled={!displayCharacter}
          >
            {showBaselineDetails ? "Hide details" : "Show details"}
          </button>
        <button
          class="cs-edit-btn"
          onclick={startEdit}
          disabled={editing || !canEdit || !displayCharacter || saving}
          title="Edit character sheet"
          aria-label="Edit character sheet"
        >
          <IconPencilSquare size={12} strokeWidth={2} />
        </button>
        <button class="cs-close-btn" onclick={closeCharSheet}>×</button>
      </div>
    </div>
    <div class="panel-body" data-scroll-root="modal">
      {#if isInspectMode}
        {#if inspectLoading}
          <div class="empty">Loading character...</div>
        {:else if inspectError}
          <div class="empty">
            <div>{inspectError}</div>
            <button class="btn-ghost small" onclick={retryInspect}>Retry</button>
          </div>
        {:else}
          {@render charContent()}
        {/if}
      {:else}
        {@render charContent()}
      {/if}
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
  .cs-header-title {
    display: flex;
    align-items: center;
    flex: 1;
  }
  .cs-header-actions {
    display: flex;
    align-items: center;
    gap: 0.4rem;
  }
  .cs-toggle-btn {
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
  .cs-toggle-btn:hover:not(:disabled) {
    color: var(--text);
    border-color: var(--border-hover);
  }
  .cs-toggle-btn:disabled {
    opacity: 0.5;
  }
  .cs-edit-btn {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: var(--radius-pill);
    padding: 0.2rem 0.6rem;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    min-width: auto;
    min-height: auto;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .cs-edit-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .cs-close-btn {
    min-width: 40px;
    min-height: 40px;
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

  /* ── Edit form ────────────────────────────────────── */
  .cs-edit {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }
  .cs-empty-edit {
    font-size: 0.85rem;
    color: var(--text-dim);
    padding: 0.35rem 0;
  }
  .cs-inv-row {
    display: grid;
    grid-template-columns: 1fr 1.3fr auto;
    gap: 0.4rem;
    align-items: center;
    margin-top: 0.35rem;
  }
  .cs-inv-row input {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: 6px;
    padding: 0.35rem 0.45rem;
    font-size: 0.85rem;
  }
  .cs-inv-remove {
    background: none;
    border: 1px solid var(--border);
    color: var(--text-dim);
    border-radius: 6px;
    width: 28px;
    height: 28px;
  }
  .cs-inv-remove:hover {
    color: var(--text);
    border-color: var(--text-dim);
  }
  .cs-edit-actions {
    display: flex;
    justify-content: flex-end;
    gap: 0.5rem;
    padding-top: 0.25rem;
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
