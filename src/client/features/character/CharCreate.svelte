<script lang="ts">
  import { get } from "svelte/store"
  import { onMount } from "svelte"
  import type { StoryModules } from "../../api/client.js"
  import { goBack, navigate, showError, showQuietNotice } from "../../stores/ui.js"
  import { autoresize } from "../../utils/actions/autoresize.js"
  import {
    pendingCharacter,
    pendingCharacterId,
    pendingCharacterImportText,
    pendingCharacterImportCard,
    pendingCharacterImportAvatarDataUrl,
    pendingStoryModules,
  } from "../../stores/game.js"
  import { pendingCharacterGenerateDescription } from "../../stores/game.js"
  import { storyDefaults } from "../../stores/settings.js"
  import personalityOptions from "../../../../shared/config/traits.json"
  import { loadPromptHistory, savePromptHistory, removePromptHistory } from "../../utils/promptHistory.js"
  import { normalizeGender } from "../../utils/text.js"
  import PromptHistoryPanel from "../../components/ui/PromptHistoryPanel.svelte"
  import StoryModulesPanel from "../../components/ui/StoryModulesPanel.svelte"
  import {
    generateCharacterFromDescription,
    generateCharacterAppearance,
    generateCharacterClothing,
    generateCharacterTraits,
    importCharacter,
  } from "./actions.js"

  const CHARACTER_PROMPT_HISTORY_KEY = "na:prompt_history:character"

  // Ordered as opposite pairs — each adjacent pair blocks each other
  const PERSONALITY_OPTIONS = personalityOptions
  const normalizeKey = (t: string) => t.trim().toLowerCase()
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
  let savingCharacter = false
  let autofilling = false
  let regeneratingAppearance = false
  let regeneratingClothing = false
  let regeneratingTraits = false
  let promptHistory: string[] = []

  onMount(() => {
    promptHistory = loadPromptHistory(CHARACTER_PROMPT_HISTORY_KEY)
    if (!$pendingStoryModules) pendingStoryModules.set($storyDefaults)
  })

  async function generate() {
    if (generating) return
    const prompt = $pendingCharacterGenerateDescription.trim()
    if (!prompt) return
    generating = true
    try {
      promptHistory = savePromptHistory(CHARACTER_PROMPT_HISTORY_KEY, prompt)
      const result = await generateCharacterFromDescription(prompt, activeModules)
      name = result.name
      race = result.race
      gender = normalizeGender(result.gender)
      if (activeModules.character_detail_mode === "general") {
        generalDescription = result.general_description ?? generalDescription
        if (traitsEnabled && result.personality_traits) {
          const split = splitPersonalityTraits(result.personality_traits)
          selectedTraits = split.selected
          customPersonalityTraits = split.custom
        }
        if (majorFlawsEnabled && result.major_flaws) majorFlaws = result.major_flaws
        if (quirksEnabled && result.quirks) quirks = result.quirks
        if (perksEnabled && result.perks) perks = result.perks
      } else {
        if (result.baseline_appearance) {
          baselineAppearance = result.baseline_appearance
          currentAppearance = result.baseline_appearance
        }
        if (result.current_clothing) currentClothing = result.current_clothing
        if (traitsEnabled) {
          const split = splitPersonalityTraits(result.personality_traits ?? [])
          selectedTraits = split.selected
          customPersonalityTraits = split.custom
        }
        if (majorFlawsEnabled && result.major_flaws) majorFlaws = result.major_flaws
        if (quirksEnabled && result.quirks) quirks = result.quirks
        if (perksEnabled && result.perks) perks = result.perks
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : "Generation failed")
    } finally {
      generating = false
    }
  }

  const isMissingText = (value: string) => {
    const trimmed = value.trim()
    return !trimmed || /^unknown\b/i.test(trimmed)
  }

  function mergeTraits(existing: string[], incoming: string[], limit = 5): string[] {
    const seen = new Set(existing.map(normalizeKey))
    const out = [...existing]
    for (const trait of incoming) {
      const key = normalizeKey(trait)
      if (!key || seen.has(key)) continue
      out.push(trait)
      seen.add(key)
      if (out.length >= limit) break
    }
    return out
  }

  async function autofillFromImport() {
    if (autofilling) return
    const seed = $pendingCharacterImportText.trim()
    if (!seed) {
      showError("No import data available for autofill")
      return
    }
    autofilling = true
    try {
      const prompt = [
        "Use the following SillyTavern character card data to infer missing fields.",
        "Focus on race, gender, baseline appearance, clothing, personality traits, quirks, and perks.",
        seed,
      ].join("\n")
      const result = await generateCharacterFromDescription(prompt, activeModules)

      if (isMissingText(name)) name = result.name
      if (isMissingText(race)) race = result.race
      if (isMissingText(gender) || gender.toLowerCase() === "unknown") {
        gender = normalizeGender(result.gender, gender)
      }
      if (activeModules.character_detail_mode === "general") {
        if (isMissingText(generalDescription) && result.general_description) {
          generalDescription = result.general_description
        }
      } else {
        if (isMissingText(baselineAppearance) && result.baseline_appearance)
          baselineAppearance = result.baseline_appearance
        if (isMissingText(currentAppearance) && result.baseline_appearance)
          currentAppearance = result.baseline_appearance
        if (isMissingText(currentClothing) && result.current_clothing) currentClothing = result.current_clothing
      }

      if (traitsEnabled) {
        const existingTraits = [...selectedTraits, ...customPersonalityTraits]
        const generatedTraits = result.personality_traits ?? []
        if (existingTraits.length < 2) {
          const split = splitPersonalityTraits(generatedTraits)
          selectedTraits = split.selected
          customPersonalityTraits = split.custom
        } else if (existingTraits.length < 5) {
          const merged = mergeTraits(existingTraits, generatedTraits, 5)
          const split = splitPersonalityTraits(merged)
          selectedTraits = split.selected
          customPersonalityTraits = split.custom
        }
      }

      if (quirksEnabled && quirks.length === 0 && result.quirks) quirks = result.quirks
      if (majorFlawsEnabled && majorFlaws.length === 0 && result.major_flaws) majorFlaws = result.major_flaws
      if (perksEnabled && perks.length === 0 && result.perks) perks = result.perks
    } catch (err) {
      showError(err instanceof Error ? err.message : "Autofill failed")
    } finally {
      autofilling = false
    }
  }

  let name = existing?.name ?? ""
  let race = existing?.race ?? ""
  let gender: string = normalizeGender(existing?.gender ?? "Female", "Female")
  $: genderCustom = gender !== "Male" && gender !== "Female" ? gender : ""
  function setGenderCustom(val: string) {
    const normalized = normalizeGender(val, "")
    gender = normalized || "Female"
  }
  let generalDescription = existing?.general_description ?? ""
  let baselineAppearance = existing?.baseline_appearance ?? ""
  let currentAppearance = existing?.current_appearance ?? ""
  let currentClothing = existing?.current_clothing ?? ""
  let selectedTraits: string[] = initialPersonality.selected
  let customPersonalityInput = ""
  let customPersonalityTraits: string[] = initialPersonality.custom
  let majorFlawInput = ""
  let majorFlaws: string[] = existing?.major_flaws ?? []
  let quirkInput = ""
  let perkInput = ""
  let quirks: string[] = existing?.quirks ?? []
  let perks: string[] = existing?.perks ?? []
  $: totalPersonalityCount = selectedTraits.length + customPersonalityTraits.length
  let activeModules: StoryModules = $pendingStoryModules ?? $storyDefaults
  $: activeModules = $pendingStoryModules ?? $storyDefaults
  $: traitsEnabled = activeModules.character_personality_traits
  $: majorFlawsEnabled = activeModules.character_major_flaws
  $: quirksEnabled = activeModules.character_quirks
  $: perksEnabled = activeModules.character_perks
  $: canRegenerateTraits =
    activeModules.character_detail_mode === "detailed" &&
    traitsEnabled &&
    majorFlawsEnabled &&
    quirksEnabled &&
    perksEnabled

  function setModules(next: StoryModules) {
    pendingStoryModules.set(next)
  }

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

  function addMajorFlaw() {
    const t = majorFlawInput.trim()
    if (t && !majorFlaws.includes(t)) {
      majorFlaws = [...majorFlaws, t]
    }
    majorFlawInput = ""
  }

  function removeQuirk(t: string) {
    quirks = quirks.filter((x) => x !== t)
  }

  function removeMajorFlaw(t: string) {
    majorFlaws = majorFlaws.filter((x) => x !== t)
  }

  function addPerk() {
    const t = perkInput.trim()
    if (t && !perks.includes(t)) {
      perks = [...perks, t]
    }
    perkInput = ""
  }

  function usePrompt(value: string) {
    pendingCharacterGenerateDescription.set(value)
  }

  function deletePrompt(value: string) {
    promptHistory = removePromptHistory(CHARACTER_PROMPT_HISTORY_KEY, value)
  }

  function removePerk(t: string) {
    perks = perks.filter((x) => x !== t)
  }

  function validate() {
    if (!name.trim()) return "Name is required"
    if (!race.trim()) return "Race is required"
    if (!gender.trim()) return "Gender is required"
    if (activeModules.character_detail_mode === "general" && !generalDescription.trim())
      return "General description is required"
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
      general_description: generalDescription.trim(),
      current_location: existing?.current_location ?? "Unknown location",
      baseline_appearance: baselineAppearance.trim(),
      current_appearance: currentAppearance.trim() || baselineAppearance.trim(),
      current_clothing: currentClothing.trim(),
      personality_traits: uniquePersonality([...selectedTraits, ...customPersonalityTraits]).filter((_, i) => i < 5),
      major_flaws: majorFlaws,
      quirks,
      perks,
    }
  }

  function buildCharacterData() {
    return buildCharacterContext()
  }

  async function regenerateAppearance() {
    if (regeneratingAppearance) return
    if (activeModules.character_detail_mode === "general") {
      showError("Appearance regeneration is disabled in general mode")
      return
    }
    regeneratingAppearance = true
    try {
      const result = await generateCharacterAppearance(buildCharacterContext(), activeModules)
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
    if (!canRegenerateTraits) {
      showError(
        activeModules.character_detail_mode === "general"
          ? "Trait regeneration is disabled in general mode"
          : "Trait regeneration is disabled by story modules",
      )
      return
    }
    regeneratingTraits = true
    try {
      const result = await generateCharacterTraits(buildCharacterContext(), activeModules)
      const split = splitPersonalityTraits(result.personality_traits)
      selectedTraits = split.selected
      customPersonalityTraits = split.custom
      majorFlaws = result.major_flaws
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
    if (activeModules.character_detail_mode === "general") {
      showError("Clothing regeneration is disabled in general mode")
      return
    }
    regeneratingClothing = true
    try {
      const result = await generateCharacterClothing(buildCharacterContext(), activeModules)
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

  async function saveCharacter() {
    if (savingCharacter) return
    const err = validate()
    if (err) {
      showError(err)
      return
    }
    savingCharacter = true
    try {
      const result = await importCharacter(
        buildCharacterData(),
        $pendingCharacterImportCard,
        $pendingCharacterImportAvatarDataUrl,
      )
      if (result.needs_review) {
        showError("Saved character needs review. Please check the fields and try again.")
        return
      }
      showQuietNotice(`Character "${result.character.name}" saved.`)
    } catch (err) {
      showError(err instanceof Error ? err.message : "Failed to save character")
    } finally {
      savingCharacter = false
    }
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
      {#if $pendingCharacterImportText.trim()}
        <div class="import-autofill">
          <div class="import-label">Imported character detected.</div>
          <button class="btn-ghost small" onclick={autofillFromImport} disabled={autofilling}
            >{autofilling ? "Autofilling..." : "Autofill Missing Fields"}</button
          >
        </div>
      {/if}
      <PromptHistoryPanel items={promptHistory} onUse={usePrompt} onDelete={deletePrompt} />
    </div>

    <div class="field">
      <label for="char-name">Name</label>
      <input id="char-name" type="text" bind:value={name} placeholder="Full legal name" />
    </div>

    <div class="field-row">
      <div class="field">
        <label for="char-race">Race</label>
        <input id="char-race" type="text" bind:value={race} placeholder="e.g. Human, Elf, Dwarf..." />
      </div>

      <div class="field">
        <label id="gender-label" for="gender-custom">Gender</label>
        <div class="gender-row">
          {#each ["Male", "Female"] as g}
            <button class="toggle {gender === g ? 'active' : ''}" onclick={() => (gender = g)}>{g}</button>
          {/each}
          <input
            id="gender-custom"
            type="text"
            class="gender-custom {gender !== 'Male' && gender !== 'Female' ? 'active' : ''}"
            placeholder="or specify..."
            value={genderCustom}
            oninput={(e) => setGenderCustom((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>
    </div>

    <div class="field">
      <div class="modules-shell">
        <div class="modules-shell-header">Story Modules</div>
        <div class="modules-shell-body">
          <StoryModulesPanel modules={activeModules} {setModules} bare />
        </div>
      </div>
    </div>

    {#if activeModules.character_detail_mode === "general"}
      <div class="field">
        <label for="char-general-description">General Description</label>
        <textarea
          id="char-general-description"
          bind:value={generalDescription}
          placeholder="Describe personality, appearance, clothing, and overall vibe in a few sentences..."
          use:autoresize={generalDescription}
        ></textarea>
      </div>
    {/if}

    {#if activeModules.character_detail_mode === "detailed"}
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
    {/if}

    {#if traitsEnabled}
      <div class="field">
        <div class="label-row">
          <!-- svelte-ignore a11y_label_has_associated_control -->
          <label id="traits-label">Personality Traits <span class="hint">(pick up to 5)</span></label>
          <button
            class="btn-ghost btn-mini"
            onclick={regenerateTraits}
            disabled={generating || regeneratingTraits || !canRegenerateTraits}
          >
            {regeneratingTraits ? "Regenerating..." : "Regenerate"}
          </button>
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
    {/if}

    {#if majorFlawsEnabled}
      <div class="field">
        <label for="major-flaw-input">Major Flaws <span class="hint">(optional)</span></label>
        <div class="custom-input">
          <input
            id="major-flaw-input"
            type="text"
            bind:value={majorFlawInput}
            placeholder="e.g. crippling fear of fire"
            onkeydown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault()
                addMajorFlaw()
              }
            }}
          />
          <button class="btn-ghost" onclick={addMajorFlaw}>+ Add</button>
        </div>
        {#if majorFlaws.length > 0}
          <div class="chips">
            {#each majorFlaws as t}
              <button class="chip selected" onclick={() => removeMajorFlaw(t)}>{t} ×</button>
            {/each}
          </div>
        {/if}
      </div>
    {/if}

    {#if quirksEnabled}
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
    {/if}

    {#if perksEnabled}
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
    {/if}
  </div>

  <div class="actions">
    <button class="btn-ghost" onclick={saveCharacter} disabled={savingCharacter}>
      {savingCharacter ? "Saving..." : "Save Character"}
    </button>
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
    --compact: 0;
    --custom-len: 0;
  }
  .gender-row .toggle {
    flex: 0 0 calc(5rem - 2.2rem * var(--compact));
  }
  .toggle-icon {
    display: inline-block;
    opacity: var(--compact);
    font-size: 1rem;
    line-height: 1;
    max-width: calc(1rem * var(--compact));
    margin-right: calc(0.2rem * var(--compact));
    overflow: hidden;
    transition:
      opacity 220ms ease,
      max-width 220ms ease,
      margin-right 220ms ease;
    transform: scale(calc(0.8 + 0.2 * var(--compact)));
    transition:
      opacity 220ms ease,
      max-width 220ms ease,
      margin-right 220ms ease,
      transform 220ms ease;
  }
  .toggle-text {
    display: inline-block;
    opacity: calc(1 - var(--compact));
    max-width: calc(4.5rem * (1 - var(--compact)));
    overflow: hidden;
    white-space: nowrap;
    transition:
      opacity 220ms ease,
      max-width 220ms ease;
  }
  .toggle {
    transition:
      min-width 220ms ease,
      padding 220ms ease;
    min-width: calc(4.6rem - 1.4rem * var(--compact));
    padding: calc(0.6rem - 0.08rem * var(--compact));
  }
  .gender-custom {
    flex: 1 1 auto;
    flex-grow: calc(1 + var(--custom-len) * 0.08);
    flex-basis: calc(8ch + var(--custom-len) * 0.7ch);
    max-width: 36ch;
    min-width: 8ch;
    transition:
      flex-basis 240ms ease,
      max-width 240ms ease,
      flex-grow 240ms ease;
  }
  .field-row {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 0.75rem;
  }
  @media (max-width: 720px) {
    .field-row {
      grid-template-columns: 1fr;
    }
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
  .import-autofill {
    margin-top: 0.6rem;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }
  .import-label {
    font-size: 0.75rem;
    color: var(--text-dim);
  }
</style>
