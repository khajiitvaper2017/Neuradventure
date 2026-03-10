<script lang="ts">
  import { get } from "svelte/store"
  import { api } from "../api/client.js"
  import { activeScreen, showError } from "../stores/ui.js"
  import { pendingCharacter } from "../stores/game.js"
  import { pendingCharacterGenerateDescription } from "../stores/game.js"
  import personalityOptions from "../../../shared/traits.json"

  // Ordered as opposite pairs — each adjacent pair blocks each other
  const PERSONALITY_OPTIONS = personalityOptions
  const normalizeKey = (t: string) => t.trim().toLowerCase()
  const normalizeGender = (value: string, fallback = "female") => {
    const trimmed = value.trim()
    if (!trimmed) return fallback
    const lower = trimmed.toLowerCase()
    if (lower === "male") return "male"
    if (lower === "female") return "female"
    return trimmed
  }
  const PERSONALITY_CANONICAL: Record<string, string> = Object.fromEntries(
    PERSONALITY_OPTIONS.map((t) => [normalizeKey(t), t]),
  )

  const OPPOSITES: Record<string, string> = Object.fromEntries(
    PERSONALITY_OPTIONS.reduce<[string, string][]>((acc, _, i, arr) => {
      if (i % 2 === 0) acc.push([arr[i], arr[i + 1]], [arr[i + 1], arr[i]])
      return acc
    }, []),
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

  let generating = false
  let regeneratingAppearance = false
  let regeneratingClothing = false
  let regeneratingTraits = false

  async function generate() {
    if (!$pendingCharacterGenerateDescription.trim()) return
    generating = true
    try {
      const result = await api.generate.character($pendingCharacterGenerateDescription.trim())
      name = result.name
      race = result.race
      gender = normalizeGender(result.gender)
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
  let gender: string = normalizeGender(existing?.gender ?? "female")
  $: genderCustom = gender !== "male" && gender !== "female" ? gender : ""
  function setGenderCustom(val: string) {
    const normalized = normalizeGender(val, "")
    gender = normalized || "female"
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

  function buildCharacterContext() {
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

  function buildCharacterData() {
    return buildCharacterContext()
  }

  async function regenerateAppearance() {
    if (regeneratingAppearance) return
    regeneratingAppearance = true
    try {
      const result = await api.generate.characterAppearance(buildCharacterContext())
      physicalDescription = result.physical_description
    } catch (err) {
      showError(err instanceof Error ? err.message : "Regeneration failed")
    } finally {
      regeneratingAppearance = false
    }
  }

  async function regenerateTraits() {
    if (regeneratingTraits) return
    regeneratingTraits = true
    try {
      const result = await api.generate.characterTraits(buildCharacterContext())
      const split = splitPersonalityTraits(result.personality_traits)
      selectedTraits = split.selected
      customPersonalityTraits = split.custom
      customTraits = result.custom_traits
    } catch (err) {
      showError(err instanceof Error ? err.message : "Regeneration failed")
    } finally {
      regeneratingTraits = false
    }
  }

  async function regenerateClothing() {
    if (regeneratingClothing) return
    regeneratingClothing = true
    try {
      const result = await api.generate.characterClothing(buildCharacterContext())
      currentClothing = result.current_clothing
    } catch (err) {
      showError(err instanceof Error ? err.message : "Regeneration failed")
    } finally {
      regeneratingClothing = false
    }
  }

  function useNow() {
    const err = validate()
    if (err) {
      showError(err)
      return
    }
    pendingCharacter.set(buildCharacterData())
    activeScreen.set("new-story")
  }

  function autoresize(node: HTMLTextAreaElement, _value: string) {
    const resize = () => {
      node.style.height = "0px"
      node.style.height = `${node.scrollHeight}px`
    }

    const schedule = () => requestAnimationFrame(resize)

    schedule()
    node.addEventListener("input", schedule)
    return {
      update() {
        schedule()
      },
      destroy() {
        node.removeEventListener("input", schedule)
      },
    }
  }
</script>

<div class="screen char-create">
  <header class="screen-header">
    <button class="back-btn" onclick={() => activeScreen.set("home")}>← Back</button>
    <h2 class="screen-title">Create Character</h2>
  </header>

  <div class="form-scroll" data-scroll-root="screen">
    <div class="field generate-field">
      <label for="char-generate">Generate from Description</label>
      <div class="generate-row">
        <textarea
          id="char-generate"
          bind:value={$pendingCharacterGenerateDescription}
          placeholder="e.g. a grizzled old sailor who lost his family at sea"
          use:autoresize={$pendingCharacterGenerateDescription}
        ></textarea>
        <button
          class="btn-ghost generate-btn"
          onclick={generate}
          disabled={generating || !$pendingCharacterGenerateDescription.trim()}
          >{generating ? "Generating..." : "✦ Generate"}</button
        >
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
      <label id="gender-label" for="gender-custom">Gender</label>
      <div class="gender-row">
        {#each ["male", "female"] as g}
          <button class="toggle {gender === g ? 'active' : ''}" onclick={() => (gender = g)}
            >{g.charAt(0).toUpperCase() + g.slice(1)}</button
          >
        {/each}
        <input
          id="gender-custom"
          type="text"
          class="gender-custom {gender !== 'male' && gender !== 'female' ? 'active' : ''}"
          placeholder="or specify..."
          value={genderCustom}
          oninput={(e) => setGenderCustom((e.target as HTMLInputElement).value)}
        />
      </div>
    </div>

    <div class="field">
      <div class="label-row">
        <label for="char-appearance">Appearance</label>
        <button
          class="btn-ghost btn-mini"
          onclick={regenerateAppearance}
          disabled={generating || regeneratingAppearance}
          >{regeneratingAppearance ? "Regenerating..." : "Regenerate"}</button
        >
      </div>
      <textarea
        id="char-appearance"
        bind:value={physicalDescription}
        placeholder="Describe your character's physical appearance..."
        use:autoresize={physicalDescription}
      ></textarea>
    </div>

    <div class="field">
      <div class="label-row">
        <label for="char-clothing">Starting Clothing</label>
        <button class="btn-ghost btn-mini" onclick={regenerateClothing} disabled={generating || regeneratingClothing}
          >{regeneratingClothing ? "Regenerating..." : "Regenerate"}</button
        >
      </div>
      <textarea
        id="char-clothing"
        bind:value={currentClothing}
        placeholder="What are they wearing?"
        use:autoresize={currentClothing}
      ></textarea>
    </div>

    <div class="field">
      <div class="label-row">
        <!-- svelte-ignore a11y_label_has_associated_control -->
        <label id="traits-label">Personality Traits <span class="hint">(pick up to 5)</span></label>
        <button class="btn-ghost btn-mini" onclick={regenerateTraits} disabled={generating || regeneratingTraits}
          >{regeneratingTraits ? "Regenerating..." : "Regenerate"}</button
        >
      </div>
      <div class="chips">
        {#each PERSONALITY_OPTIONS as trait}
          <button
            class="chip {selectedTraits.includes(trait) ? 'selected' : ''}"
            onclick={() => toggleTrait(trait)}
            disabled={!selectedTraits.includes(trait) && (totalPersonalityCount >= 5 || isBlocked(trait))}
            >{trait}</button
          >
        {/each}
      </div>
    </div>

    <div class="field">
      <label for="custom-personality-input"
        >Custom Personality Traits <span class="hint">(optional, counts toward 5)</span></label
      >
      <div class="custom-input">
        <input
          id="custom-personality-input"
          type="text"
          bind:value={customPersonalityInput}
          placeholder="e.g. Recklessly brave"
          disabled={totalPersonalityCount >= 5}
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addCustomPersonalityTrait()
            }
          }}
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
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addCustomTrait()
            }
          }}
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
    <button class="btn-accent" onclick={useNow}>Use Now →</button>
  </div>
</div>

<style>
  .char-create {
    display: flex;
    flex-direction: column;
    height: 100%;
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
  .custom-input {
    display: flex;
    gap: 0.5rem;
  }
  .custom-input input {
    flex: 1;
  }
</style>
