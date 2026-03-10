<script lang="ts">
  import { get } from "svelte/store"
  import { api } from "../api/client.js"
  import { activeScreen, showError } from "../stores/ui.js"
  import { pendingCharacter } from "../stores/game.js"
  import personalityOptions from "../../../shared/traits.json"

  // Ordered as opposite pairs — each adjacent pair blocks each other
  const PERSONALITY_OPTIONS = personalityOptions
  const normalizeKey = (t: string) => t.trim().toLowerCase()
  const PERSONALITY_CANONICAL: Record<string, string> = Object.fromEntries(
    PERSONALITY_OPTIONS.map((t) => [normalizeKey(t), t])
  )

  const OPPOSITES: Record<string, string> = Object.fromEntries(
    PERSONALITY_OPTIONS.reduce<[string, string][]>((acc, _, i, arr) => {
      if (i % 2 === 0) acc.push([arr[i], arr[i + 1]], [arr[i + 1], arr[i]])
      return acc
    }, [])
  )

  const existing = get(pendingCharacter)
  const splitPersonalityTraits = (traits: string[]) => {
    const cleaned = traits.map((t) => t.trim()).filter(Boolean)
    const selectedMap = new Map<string, string>()
    const customMap = new Map<string, string>()
    for (const raw of cleaned) {
      const key = normalizeKey(raw)
      const canonical = PERSONALITY_CANONICAL[key]
      if (canonical) {
        if (!selectedMap.has(key)) selectedMap.set(key, canonical)
      } else if (!customMap.has(key)) {
        customMap.set(key, raw)
      }
    }
    const selected = Array.from(selectedMap.values()).slice(0, 5)
    const remaining = 5 - selected.length
    const custom = Array.from(customMap.values()).slice(0, remaining)
    return { selected, custom }
  }
  const initialPersonality = splitPersonalityTraits(existing?.personality_traits ?? [])

  let generateDescription = ""
  let generating = false

  async function generate() {
    if (!generateDescription.trim()) return
    generating = true
    try {
      const result = await api.generate.character(generateDescription.trim())
      name = result.name
      race = result.race
      gender = result.gender
      physicalDescription = result.physical_description
      currentClothing = result.current_clothing
      const split = splitPersonalityTraits(result.personality_traits)
      selectedTraits = split.selected
      customPersonalityTraits = split.custom
      customTraits = result.custom_traits
    } catch (err) {
      showError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      generating = false
    }
  }

  let name = existing?.name ?? ""
  let race = existing?.race ?? ""
  let gender: string = existing?.gender ?? "female"
  $: genderCustom = gender !== "male" && gender !== "female" ? gender : ""
  function setGenderCustom(val: string) {
    gender = val || "female"
  }
  let physicalDescription = existing?.appearance.physical_description ?? ""
  let currentClothing = existing?.appearance.current_clothing ?? ""
  let selectedTraits: string[] = initialPersonality.selected
  let customPersonalityInput = ""
  let customPersonalityTraits: string[] = initialPersonality.custom
  let customTraitInput = ""
  let customTraits: string[] = existing?.custom_traits ?? []
  $: totalPersonalityCount = selectedTraits.length + customPersonalityTraits.length

  function isBlocked(trait: string): boolean {
    const opp = OPPOSITES[trait]
    return opp != null && selectedTraits.includes(opp)
  }

  function toggleTrait(trait: string) {
    if (selectedTraits.includes(trait)) {
      selectedTraits = selectedTraits.filter((t) => t !== trait)
    } else if (totalPersonalityCount < 5 && !isBlocked(trait)) {
      selectedTraits = [...selectedTraits, trait]
    }
  }

  function addCustomPersonalityTrait() {
    const t = customPersonalityInput.trim()
    if (!t || totalPersonalityCount >= 5) return
    const key = normalizeKey(t)
    const canonical = PERSONALITY_CANONICAL[key]
    if (canonical) {
      if (!selectedTraits.includes(canonical) && !isBlocked(canonical)) {
        selectedTraits = [...selectedTraits, canonical]
      }
      customPersonalityInput = ""
      return
    }
    const existingCustomKeys = new Set(customPersonalityTraits.map(normalizeKey))
    if (!existingCustomKeys.has(key)) {
      customPersonalityTraits = [...customPersonalityTraits, t]
    }
    customPersonalityInput = ""
  }

  function removeCustomPersonalityTrait(t: string) {
    customPersonalityTraits = customPersonalityTraits.filter((x) => x !== t)
  }

  function addCustomTrait() {
    const t = customTraitInput.trim()
    if (t && !customTraits.includes(t)) {
      customTraits = [...customTraits, t]
    }
    customTraitInput = ""
  }

  function removeCustomTrait(t: string) {
    customTraits = customTraits.filter((x) => x !== t)
  }

  function validate() {
    if (!name.trim()) return "Name is required"
    if (!race.trim()) return "Race is required"
    if (!physicalDescription.trim()) return "Appearance description is required"
    if (!currentClothing.trim()) return "Current clothing is required"
    return null
  }

  function buildCharacterData() {
    const seen = new Set<string>()
    const uniquePersonality = (traits: string[]) => {
      const out: string[] = []
      for (const raw of traits) {
        const t = raw.trim()
        if (!t) continue
        const key = normalizeKey(t)
        if (seen.has(key)) continue
        seen.add(key)
        out.push(t)
      }
      return out
    }
    return {
      name: name.trim(),
      race: race.trim(),
      gender,
      appearance: {
        physical_description: physicalDescription.trim(),
        current_clothing: currentClothing.trim(),
      },
      personality_traits: uniquePersonality([...selectedTraits, ...customPersonalityTraits]).slice(0, 5),
      custom_traits: customTraits,
    }
  }

  async function saveTemplate() {
    const err = validate()
    if (err) { showError(err); return }
    try {
      await api.characters.create(buildCharacterData())
      useNow()
    } catch {
      showError("Failed to save character template")
    }
  }

  function useNow() {
    const err = validate()
    if (err) { showError(err); return }
    pendingCharacter.set(buildCharacterData())
    activeScreen.set("new-story")
  }
</script>

<div class="screen char-create">
  <header>
    <button class="back-btn" onclick={() => activeScreen.set("home")}>← Back</button>
    <h2>Create Character</h2>
  </header>

  <div class="form-scroll" data-scroll-root="screen">
    <div class="field generate-field">
      <label for="char-generate">Generate from Description</label>
      <div class="generate-row">
        <textarea
          id="char-generate"
          bind:value={generateDescription}
          placeholder="e.g. a grizzled old sailor who lost his family at sea"
          rows="2"
        ></textarea>
        <button
          class="btn-ghost generate-btn"
          onclick={generate}
          disabled={generating || !generateDescription.trim()}
        >{generating ? "Generating..." : "✦ Generate"}</button>
      </div>
    </div>

    <div class="field">
      <label for="char-name">Name</label>
      <input id="char-name" type="text" bind:value={name} placeholder="Your character's name" />
    </div>

    <div class="field">
      <label for="char-race">Race</label>
      <input id="char-race" type="text" bind:value={race} placeholder="e.g. Human, Elf, Dwarf..." />
    </div>

    <div class="field">
      <label id="gender-label">Gender</label>
      <div class="gender-row">
        {#each ["male", "female"] as g}
          <button
            class="toggle {gender === g ? 'active' : ''}"
            onclick={() => (gender = g)}
          >{g.charAt(0).toUpperCase() + g.slice(1)}</button>
        {/each}
        <input
          type="text"
          class="gender-custom {gender !== 'male' && gender !== 'female' ? 'active' : ''}"
          placeholder="or specify..."
          value={genderCustom}
          oninput={(e) => setGenderCustom((e.target as HTMLInputElement).value)}
        />
      </div>
    </div>

    <div class="field">
      <label for="char-appearance">Appearance</label>
      <textarea
        id="char-appearance"
        bind:value={physicalDescription}
        placeholder="Describe your character's physical appearance..."
        rows="3"
      ></textarea>
    </div>

    <div class="field">
      <label for="char-clothing">Starting Clothing</label>
      <textarea
        id="char-clothing"
        bind:value={currentClothing}
        placeholder="What are they wearing?"
        rows="2"
      ></textarea>
    </div>

    <div class="field">
      <label id="traits-label">Personality Traits <span class="hint">(pick up to 5)</span></label>
      <div class="chips">
        {#each PERSONALITY_OPTIONS as trait}
          <button
            class="chip {selectedTraits.includes(trait) ? 'selected' : ''}"
            onclick={() => toggleTrait(trait)}
            disabled={!selectedTraits.includes(trait) && (totalPersonalityCount >= 5 || isBlocked(trait))}
          >{trait}</button>
        {/each}
      </div>
    </div>

    <div class="field">
      <label for="custom-personality-input">Custom Personality Traits <span class="hint">(optional, counts toward 5)</span></label>
      <div class="custom-input">
        <input
          id="custom-personality-input"
          type="text"
          bind:value={customPersonalityInput}
          placeholder="e.g. Recklessly brave"
          disabled={totalPersonalityCount >= 5}
          onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomPersonalityTrait() } }}
        />
        <button class="btn-ghost" onclick={addCustomPersonalityTrait} disabled={totalPersonalityCount >= 5}>
          + Add
        </button>
      </div>
      {#if customPersonalityTraits.length > 0}
        <div class="chips">
          {#each customPersonalityTraits as t}
            <button class="chip selected" onclick={() => removeCustomPersonalityTrait(t)}>{t} ×</button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="field">
      <label for="custom-trait-input">Custom Traits <span class="hint">(optional)</span></label>
      <div class="custom-input">
        <input
          id="custom-trait-input"
          type="text"
          bind:value={customTraitInput}
          placeholder="e.g. grew up in the forest"
          onkeydown={(e) => { if (e.key === "Enter") { e.preventDefault(); addCustomTrait() } }}
        />
        <button class="btn-ghost" onclick={addCustomTrait}>+ Add</button>
      </div>
      {#if customTraits.length > 0}
        <div class="chips">
          {#each customTraits as t}
            <button class="chip selected" onclick={() => removeCustomTrait(t)}>{t} ×</button>
          {/each}
        </div>
      {/if}
    </div>
  </div>

  <div class="actions">
    <button class="btn-ghost" onclick={saveTemplate}>Save Template</button>
    <button class="btn-accent" onclick={useNow}>Use Now →</button>
  </div>
</div>

<style>
  .char-create {
    display: flex;
    flex-direction: column;
    height: 100%;
  }
  header {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem;
    border-bottom: 1px solid var(--border);
  }
  h2 {
    font-family: var(--font-ui);
    font-size: 1.1rem;
    font-weight: 600;
    margin: 0;
  }
  .back-btn {
    background: none;
    border: none;
    color: var(--text-dim);
    cursor: pointer;
    padding: 0.25rem;
    font-size: 0.9rem;
    min-height: 44px;
  }
  .back-btn:hover { color: var(--text); }
  .form-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }
  label {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--text-dim);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }
  .hint {
    font-weight: 400;
    text-transform: none;
    letter-spacing: 0;
  }
  input[type="text"],
  textarea {
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text);
    padding: 0.75rem;
    font-size: 1rem;
    font-family: var(--font-ui);
    resize: none;
    width: 100%;
    box-sizing: border-box;
  }
  input[type="text"]:focus,
  textarea:focus {
    outline: none;
    border-color: var(--accent);
  }
  .gender-row {
    display: flex;
    gap: 0.5rem;
    align-items: center;
  }
  .gender-custom {
    flex: 1;
    border-color: var(--border);
  }
  .gender-custom.active {
    border-color: var(--accent);
  }
  .toggle {
    flex: 1;
    padding: 0.6rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 4px;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 0.9rem;
    min-height: 44px;
  }
  .toggle.active {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(200, 169, 110, 0.1);
  }
  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }
  .chip {
    padding: 0.4rem 0.75rem;
    background: var(--bg-input);
    border: 1px solid var(--border);
    border-radius: 20px;
    color: var(--text-dim);
    cursor: pointer;
    font-size: 0.85rem;
    min-height: 36px;
  }
  .chip:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
  .chip.selected {
    border-color: var(--accent);
    color: var(--accent);
    background: rgba(200, 169, 110, 0.12);
  }
  .custom-input {
    display: flex;
    gap: 0.5rem;
  }
  .custom-input input { flex: 1; }
  .actions {
    padding: 1rem;
    border-top: 1px solid var(--border);
    display: flex;
    gap: 0.75rem;
  }
  .actions button { flex: 1; }
  .generate-field {
    background: var(--bg-raised);
    border: 1px solid var(--border);
    border-radius: 6px;
    padding: 0.75rem;
  }
  .generate-row {
    display: flex;
    gap: 0.5rem;
    align-items: flex-start;
  }
  .generate-row textarea { flex: 1; }
  .generate-btn {
    white-space: nowrap;
    align-self: stretch;
  }
</style>
