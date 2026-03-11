<script lang="ts">
  import { api, ApiError } from "../api/client.js"
  import { showCharSheet, showError, showQuietNotice } from "../stores/ui.js"
  import { character, currentStoryId, llmUpdateId } from "../stores/game.js"
  import type { MainCharacterState } from "../api/client.js"
  import { autoresize } from "./actions/autoresize.js"
  import { genderIcon, splitCsv } from "./utils/text.js"
  import IconMale from "../icons/IconMale.svelte"
  import IconFemale from "../icons/IconFemale.svelte"
  import IconIntersex from "../icons/IconIntersex.svelte"
  import IconTransgender from "../icons/IconTransgender.svelte"
  import IconFace from "../icons/IconFace.svelte"
  import IconShirt from "../icons/IconShirt.svelte"
  import IconStar from "../icons/IconStar.svelte"
  import IconCube from "../icons/IconCube.svelte"
  import IconDotSmall from "../icons/IconDotSmall.svelte"
  import IconDocument from "../icons/IconDocument.svelte"

  let { inline = false }: { inline?: boolean } = $props()

  type CharacterSigs = {
    identity: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    baselineDescription: string
    currentActivity: string
    traits: string
    relationships: string
    inventory: string
  }

  let lastSigs: CharacterSigs | null = null
  let lastLlmUpdateId = 0
  let flashIdentity = $state(false)
  let flashAppearance = $state(false)
  let flashClothing = $state(false)
  let flashTraits = $state(false)
  let flashBackground = $state(false)
  let flashActivity = $state(false)
  let flashRelationships = $state(false)
  let flashInventory = $state(false)
  let identityTimer: number | null = null
  let appearanceTimer: number | null = null
  let clothingTimer: number | null = null
  let traitsTimer: number | null = null
  let backgroundTimer: number | null = null
  let activityTimer: number | null = null
  let relationshipsTimer: number | null = null
  let inventoryTimer: number | null = null
  let editing = $state(false)
  let saving = $state(false)

  type InventoryDraft = { name: string; description: string }
  type CharacterDraft = {
    name: string
    race: string
    gender: string
    baselineAppearance: string
    currentAppearance: string
    clothing: string
    baselineDescription: string
    currentActivity: string
    personalityTraits: string
    quirks: string
    perks: string
    relationshipScores: string
    inventory: InventoryDraft[]
  }
  let draft = $state<CharacterDraft>({
    name: "",
    race: "",
    gender: "",
    baselineAppearance: "",
    currentAppearance: "",
    clothing: "",
    baselineDescription: "",
    currentActivity: "",
    personalityTraits: "",
    quirks: "",
    perks: "",
    relationshipScores: "",
    inventory: [],
  })

  type FieldKind = "input" | "textarea"
  type EditField = {
    id: string
    label: string
    kind: FieldKind
    value: string
    onInput: (value: string) => void
  }

  function buildCharacterSigs(c: MainCharacterState): CharacterSigs {
    return {
      identity: `${c.name}|${c.race}|${c.gender}`,
      baselineAppearance: c.appearance?.baseline_appearance ?? "",
      currentAppearance: c.appearance?.current_appearance ?? "",
      clothing: c.appearance?.current_clothing ?? "",
      baselineDescription: c.baseline_description ?? "",
      currentActivity: c.current_activity ?? "",
      traits: [...c.personality_traits, ...c.quirks, ...c.perks].join("|"),
      relationships: (c.relationship_scores ?? []).map((s) => `${s.name}:${s.affinity}`).join("|"),
      inventory: c.inventory.map((item) => `${item.name}:${item.description}`).join("|"),
    }
  }

  function triggerFlash(
    kind: "identity" | "appearance" | "clothing" | "traits" | "background" | "activity" | "relationships" | "inventory",
  ) {
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
    if (kind === "background") {
      flashBackground = true
      if (backgroundTimer) window.clearTimeout(backgroundTimer)
      backgroundTimer = window.setTimeout(() => (flashBackground = false), 900)
      return
    }
    if (kind === "activity") {
      flashActivity = true
      if (activityTimer) window.clearTimeout(activityTimer)
      activityTimer = window.setTimeout(() => (flashActivity = false), 900)
      return
    }
    if (kind === "relationships") {
      flashRelationships = true
      if (relationshipsTimer) window.clearTimeout(relationshipsTimer)
      relationshipsTimer = window.setTimeout(() => (flashRelationships = false), 900)
      return
    }
    flashInventory = true
    if (inventoryTimer) window.clearTimeout(inventoryTimer)
    inventoryTimer = window.setTimeout(() => (flashInventory = false), 900)
  }

  function updateField(field: EditField, event: Event) {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement
    field.onInput(target.value)
  }

  function clampAffinity(value: number): number {
    if (!Number.isFinite(value)) return 0
    if (value < -100) return -100
    if (value > 100) return 100
    return Math.round(value)
  }

  function formatRelationshipScores(scores: MainCharacterState["relationship_scores"]): string {
    if (!scores || scores.length === 0) return ""
    return scores.map((score) => `${score.name}: ${score.affinity}`).join("\n")
  }

  function parseRelationshipScores(text: string): MainCharacterState["relationship_scores"] {
    const lines = text
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
    const scores: MainCharacterState["relationship_scores"] = []
    const seen = new Set<string>()
    for (const line of lines) {
      const match = /^(.*?)\s*[:|]\s*(-?\d+)/.exec(line)
      if (!match) continue
      const name = match[1].trim()
      if (!name) continue
      const key = name.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      scores.push({ name, affinity: clampAffinity(Number(match[2])) })
    }
    return scores
  }

  function characterFields(): EditField[] {
    return [
      { id: "cs-name", label: "Name", kind: "input", value: draft.name, onInput: (v) => (draft.name = v) },
      { id: "cs-race", label: "Race", kind: "input", value: draft.race, onInput: (v) => (draft.race = v) },
      { id: "cs-gender", label: "Gender", kind: "input", value: draft.gender, onInput: (v) => (draft.gender = v) },
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
      {
        id: "cs-baseline-description",
        label: "Baseline Description",
        kind: "textarea",
        value: draft.baselineDescription,
        onInput: (v) => (draft.baselineDescription = v),
      },
      {
        id: "cs-current-activity",
        label: "Current Activity",
        kind: "textarea",
        value: draft.currentActivity,
        onInput: (v) => (draft.currentActivity = v),
      },
      {
        id: "cs-personality",
        label: "Personality Traits (comma separated)",
        kind: "input",
        value: draft.personalityTraits,
        onInput: (v) => (draft.personalityTraits = v),
      },
      {
        id: "cs-quirks",
        label: "Quirks (comma separated)",
        kind: "input",
        value: draft.quirks,
        onInput: (v) => (draft.quirks = v),
      },
      {
        id: "cs-perks",
        label: "Perks (comma separated)",
        kind: "input",
        value: draft.perks,
        onInput: (v) => (draft.perks = v),
      },
      {
        id: "cs-relationships",
        label: "Relationship Scores (Name: affinity per line)",
        kind: "textarea",
        value: draft.relationshipScores,
        onInput: (v) => (draft.relationshipScores = v),
      },
    ]
  }

  function startEdit() {
    if (!$character) return
    draft = {
      name: $character.name,
      race: $character.race,
      gender: $character.gender,
      baselineAppearance: $character.appearance.baseline_appearance,
      currentAppearance: $character.appearance.current_appearance,
      clothing: $character.appearance.current_clothing,
      baselineDescription: $character.baseline_description,
      currentActivity: $character.current_activity,
      personalityTraits: $character.personality_traits.join(", "),
      quirks: $character.quirks.join(", "),
      perks: $character.perks.join(", "),
      relationshipScores: formatRelationshipScores($character.relationship_scores),
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
    const gender = draft.gender.trim()
    const baselineAppearance = draft.baselineAppearance.trim()
    const currentAppearance = draft.currentAppearance.trim()
    const clothing = draft.clothing.trim()
    const baselineDescription = draft.baselineDescription.trim()
    const currentActivity = draft.currentActivity.trim()
    if (!name || !race || !gender || !baselineAppearance || !currentAppearance || !clothing) {
      showError("Name, race, gender, baseline appearance, current appearance, and clothing are required.")
      return
    }
    if (!baselineDescription || !currentActivity) {
      showError("Baseline description and current activity are required.")
      return
    }
    const personalityTraits = splitCsv(draft.personalityTraits)
    const quirks = splitCsv(draft.quirks)
    const perks = splitCsv(draft.perks)
    const relationshipScores = parseRelationshipScores(draft.relationshipScores)
    const inventory = draft.inventory
      .map((item) => ({ name: item.name.trim(), description: item.description.trim() }))
      .filter((item) => item.name.length > 0 || item.description.length > 0)
    for (const item of inventory) {
      if (!item.name || !item.description) {
        showError("Inventory items need both a name and description.")
        return
      }
    }
    const nextCharacter: MainCharacterState = {
      name,
      race,
      gender,
      current_location: $character?.current_location ?? "",
      appearance: {
        baseline_appearance: baselineAppearance,
        current_appearance: currentAppearance,
        current_clothing: clothing,
      },
      baseline_description: baselineDescription,
      current_activity: currentActivity,
      personality_traits: personalityTraits,
      quirks,
      perks,
      relationship_scores: relationshipScores,
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
    if ($llmUpdateId !== lastLlmUpdateId) {
      if ($character) {
        const nextSigs = buildCharacterSigs($character)
        if (lastSigs) {
          if (nextSigs.identity !== lastSigs.identity) triggerFlash("identity")
          if (
            nextSigs.baselineAppearance !== lastSigs.baselineAppearance ||
            nextSigs.currentAppearance !== lastSigs.currentAppearance
          ) {
            triggerFlash("appearance")
          }
          if (nextSigs.clothing !== lastSigs.clothing) triggerFlash("clothing")
          if (nextSigs.traits !== lastSigs.traits) triggerFlash("traits")
          if (nextSigs.baselineDescription !== lastSigs.baselineDescription) triggerFlash("background")
          if (nextSigs.currentActivity !== lastSigs.currentActivity) triggerFlash("activity")
          if (nextSigs.relationships !== lastSigs.relationships) triggerFlash("relationships")
          if (nextSigs.inventory !== lastSigs.inventory) triggerFlash("inventory")
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
</script>

{#snippet charContent()}
  {#if $character}
    {#if editing}
      <div class="cs-edit">
        {#each characterFields() as field}
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
          {$character.name}
          {#if genderIcon($character.gender) === "male"}
            <IconMale size={14} strokeWidth={2} className="gender-icon" />
          {:else if genderIcon($character.gender) === "female"}
            <IconFemale size={14} strokeWidth={2} className="gender-icon" />
          {:else if genderIcon($character.gender) === "intersex"}
            <IconIntersex size={14} strokeWidth={2} className="gender-icon" />
          {:else if genderIcon($character.gender) === "transgender"}
            <IconTransgender size={14} strokeWidth={2} className="gender-icon" />
          {/if}
        </div>
        <div class="cs-identity-detail">{$character.race}{$character.gender ? ` · ${$character.gender}` : ""}</div>
      </div>

      <div class="cs-section" class:flash={flashAppearance}>
        <div class="cs-section-header">
          <IconFace size={14} strokeWidth={1.5} className="cs-icon" />
          <span class="section-label">Baseline Appearance</span>
        </div>
        <div class="cs-value">{$character.appearance.baseline_appearance}</div>
      </div>

      <div class="cs-section" class:flash={flashAppearance}>
        <div class="cs-section-header">
          <IconFace size={14} strokeWidth={1.5} className="cs-icon" />
          <span class="section-label">Current Appearance</span>
        </div>
        <div class="cs-value">{$character.appearance.current_appearance}</div>
      </div>

      <div class="cs-section" class:flash={flashClothing}>
        <div class="cs-section-header">
          <IconShirt size={14} strokeWidth={1.5} className="cs-icon" />
          <span class="section-label">Wearing</span>
        </div>
        <div class="cs-value">{$character.appearance.current_clothing}</div>
      </div>

      <div class="cs-section" class:flash={flashBackground}>
        <div class="cs-section-header">
          <IconDocument size={14} strokeWidth={1.5} className="cs-icon" />
          <span class="section-label">Baseline Description</span>
        </div>
        <div class="cs-value">{$character.baseline_description}</div>
      </div>

      <div class="cs-section" class:flash={flashActivity}>
        <div class="cs-section-header">
          <IconDocument size={14} strokeWidth={1.5} className="cs-icon" />
          <span class="section-label">Current Activity</span>
        </div>
        <div class="cs-value">{$character.current_activity}</div>
      </div>

      {#if $character.personality_traits.length > 0 || $character.quirks.length > 0 || $character.perks.length > 0}
        <div class="cs-section" class:flash={flashTraits}>
          <div class="cs-section-header">
            <IconStar size={14} strokeWidth={1.5} className="cs-icon" />
            <span class="section-label">Traits · Quirks · Perks</span>
          </div>
          <div class="chips">
            {#each $character.personality_traits as t}
              <span class="chip">Trait · {t}</span>
            {/each}
            {#each $character.quirks as t}
              <span class="chip">Quirk · {t}</span>
            {/each}
            {#each $character.perks as t}
              <span class="chip">Perk · {t}</span>
            {/each}
          </div>
        </div>
      {/if}

      <div class="cs-section" class:flash={flashRelationships}>
        <div class="cs-section-header">
          <IconDocument size={14} strokeWidth={1.5} className="cs-icon" />
          <span class="section-label">Relationship Scores</span>
        </div>
        {#if $character.relationship_scores.length === 0}
          <div class="cs-value muted">No scores yet.</div>
        {:else}
          <ul class="cs-relationships">
            {#each $character.relationship_scores as score}
              <li>
                <span class="cs-rel-name">{score.name}</span>
                <span class="cs-rel-affinity">{score.affinity}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </div>

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
      <button class="cs-edit-btn" onclick={startEdit} disabled={editing || !$character || !$currentStoryId || saving}>
        Edit
      </button>
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
      <div class="cs-header-title">
        <IconDocument size={16} strokeWidth={1.5} className="cs-header-icon" />
        <span>Character Sheet</span>
      </div>
      <div class="cs-header-actions">
        <button class="cs-edit-btn" onclick={startEdit} disabled={editing || !$character || !$currentStoryId || saving}>
          Edit
        </button>
        <button class="cs-close-btn" onclick={() => showCharSheet.set(false)}>×</button>
      </div>
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
  .cs-edit-btn {
    background: var(--bg-input);
    border: 1px solid var(--border);
    color: var(--text);
    border-radius: var(--radius-pill);
    padding: 0.2rem 0.6rem;
    font-size: 0.65rem;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    min-width: auto;
    min-height: auto;
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

  .cs-relationships {
    list-style: none;
    padding: 0;
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
  }

  .cs-relationships li {
    display: flex;
    justify-content: space-between;
    gap: 0.6rem;
    font-size: 0.85rem;
  }

  .cs-rel-name {
    color: var(--text);
  }

  .cs-rel-affinity {
    color: var(--text-dim);
    font-variant-numeric: tabular-nums;
  }
</style>
