<script lang="ts">
  import { get } from "svelte/store"
  import { api } from "../api/client.js"
  import { goBack, navigate, showError } from "../stores/ui.js"
  import { autoresize } from "./actions/autoresize.js"
  import { pendingCharacter, pendingCharacterId } from "../stores/game.js"
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
    const selected = Array.from(selectedMap.values()).filter((_, i) => i < 5)
    const remaining = 5 - selected.length
    const custom = Array.from(customMap.values()).filter((_, i) => i < remaining)
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
      baselineAppearance = result.baseline_appearance
      currentAppearance = result.current_appearance
      currentClothing = result.current_clothing
      baselineDescription = result.baseline_description
      currentActivity = result.current_activity
      const split = splitPersonalityTraits(result.personality_traits)
      selectedTraits = split.selected
      customPersonalityTraits = split.custom
      quirks = result.quirks
      perks = result.perks
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
  let baselineAppearance = existing?.appearance.baseline_appearance ?? ""
  let currentAppearance = existing?.appearance.current_appearance ?? ""
  let currentClothing = existing?.appearance.current_clothing ?? ""
  let baselineDescription = existing?.baseline_description ?? ""
  let currentActivity = existing?.current_activity ?? ""
  let selectedTraits: string[] = initialPersonality.selected
  let customPersonalityInput = ""
  let customPersonalityTraits: string[] = initialPersonality.custom
  let quirkInput = ""
  let perkInput = ""
  let quirks: string[] = existing?.quirks ?? []
  let perks: string[] = existing?.perks ?? []
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

  function addQuirk() {
    const t = quirkInput.trim()
    if (t && !quirks.includes(t)) {
      quirks = [...quirks, t]
    }
    quirkInput = ""
  }

  function removeQuirk(t: string) {
    quirks = quirks.filter((x) => x !== t)
  }

  function addPerk() {
    const t = perkInput.trim()
    if (t && !perks.includes(t)) {
      perks = [...perks, t]
    }
    perkInput = ""
  }

  function removePerk(t: string) {
    perks = perks.filter((x) => x !== t)
  }

  function validate() {
    if (!name.trim()) return "Name is required"
    if (!race.trim()) return "Race is required"
    if (!baselineAppearance.trim()) return "Baseline appearance is required"
    if (!currentAppearance.trim()) return "Current appearance is required"
    if (!currentClothing.trim()) return "Current clothing is required"
    if (!baselineDescription.trim()) return "Baseline description is required"
    if (!currentActivity.trim()) return "Current activity is required"
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
      current_location: existing?.current_location ?? "Unknown location",
      appearance: {
        baseline_appearance: baselineAppearance.trim(),
        current_appearance: currentAppearance.trim(),
        current_clothing: currentClothing.trim(),
      },
      baseline_description: baselineDescription.trim(),
      current_activity: currentActivity.trim(),
      personality_traits: uniquePersonality([...selectedTraits, ...customPersonalityTraits]).filter((_, i) => i < 5),
      quirks,
      perks,
      relationship_scores: existing?.relationship_scores ?? [],
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
      baselineAppearance = result.baseline_appearance
      currentAppearance = result.current_appearance
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
      quirks = result.quirks
      perks = result.perks
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
    pendingCharacterId.set(null)
    navigate("new-story")
  }
</script>

<div class="screen char-create">
  <header class="screen-header">
    <button class="back-btn" onclick={() => goBack("home")}>← Back</button>
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
      <input id="char-name" type="text" bind:value={name} placeholder="Full legal name" />
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
            >{g.charAt(0).toUpperCase() + g.substring(1)}</button
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
        <label for="char-baseline-appearance">Baseline Appearance</label>
        <button
          class="btn-ghost btn-mini"
          onclick={regenerateAppearance}
          disabled={generating || regeneratingAppearance}
          >{regeneratingAppearance ? "Regenerating..." : "Regenerate"}</button
        >
      </div>
      <textarea
        id="char-baseline-appearance"
        bind:value={baselineAppearance}
        placeholder="Permanent, surgical baseline description..."
        use:autoresize={baselineAppearance}
      ></textarea>
    </div>

    <div class="field">
      <label for="char-current-appearance">Current Appearance</label>
      <textarea
        id="char-current-appearance"
        bind:value={currentAppearance}
        placeholder="Current physical state (full description)..."
        use:autoresize={currentAppearance}
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
      <label for="char-baseline-description">Baseline Description</label>
      <textarea
        id="char-baseline-description"
        bind:value={baselineDescription}
        placeholder="Where they live, relatives, friends (even off-story)..."
        use:autoresize={baselineDescription}
      ></textarea>
    </div>

    <div class="field">
      <label for="char-current-activity">Current Activity</label>
      <textarea
        id="char-current-activity"
        bind:value={currentActivity}
        placeholder="What are they doing right now?"
        use:autoresize={currentActivity}
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
      <label for="quirk-input">Quirks <span class="hint">(optional)</span></label>
      <div class="custom-input">
        <input
          id="quirk-input"
          type="text"
          bind:value={quirkInput}
          placeholder="e.g. counts exits on entry"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addQuirk()
            }
          }}
        />
        <button class="btn-ghost" onclick={addQuirk}>+ Add</button>
      </div>
      {#if quirks.length > 0}
        <div class="chips">
          {#each quirks as t}
            <button class="chip selected" onclick={() => removeQuirk(t)}>{t} ×</button>
          {/each}
        </div>
      {/if}
    </div>

    <div class="field">
      <label for="perk-input">Perks <span class="hint">(optional)</span></label>
      <div class="custom-input">
        <input
          id="perk-input"
          type="text"
          bind:value={perkInput}
          placeholder="e.g. trained medic"
          onkeydown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault()
              addPerk()
            }
          }}
        />
        <button class="btn-ghost" onclick={addPerk}>+ Add</button>
      </div>
      {#if perks.length > 0}
        <div class="chips">
          {#each perks as t}
            <button class="chip selected" onclick={() => removePerk(t)}>{t} ×</button>
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
