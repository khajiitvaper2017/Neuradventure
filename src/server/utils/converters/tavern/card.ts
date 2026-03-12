import type { MainCharacterState } from "../../../core/models.js"
import { npcTraitLookup } from "../../../schemas/npc-traits.js"
import { getServerDefaults } from "../../../core/strings.js"
import { normalizeGender } from "../../../schemas/normalizers.js"

export interface TavernCardV2 {
  spec: "chara_card_v2"
  spec_version: "2.0"
  data: {
    name: string
    description: string
    personality: string
    scenario: string
    first_mes: string
    mes_example: string
    system_prompt: string
    post_history_instructions: string
    alternate_greetings: string[]
    tags: string[]
    creator: string
    character_version: string
    extensions: {
      neuradventure?: MainCharacterState | Omit<MainCharacterState, "inventory">
      [key: string]: unknown
    }
  }
}

export interface TavernImportResult {
  character: Omit<MainCharacterState, "inventory">
  needs_review: boolean
  source: "neuradventure" | "tavern"
  source_text?: string
}

export function characterToTavernCard(
  character: MainCharacterState | Omit<MainCharacterState, "inventory">,
): TavernCardV2 {
  const descriptionLines: string[] = []
  const defaults = getServerDefaults()
  const race = character.race?.trim() || defaults.unknown.value
  const gender = character.gender?.trim() || defaults.unknown.value
  const baselineAppearance = character.baseline_appearance?.trim() || defaults.unknown.appearance

  descriptionLines.push(`Race: ${race}. Gender: ${gender}.`)

  return {
    spec: "chara_card_v2",
    spec_version: "2.0",
    data: {
      name: character.name,
      description: `${descriptionLines.join("\n")}\n\nAppearance: ${baselineAppearance}`,
      personality: character.personality_traits.join(", "),
      scenario: "",
      first_mes: "",
      mes_example: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [...character.quirks, ...character.perks, ...(character.major_flaws ?? [])],
      creator: "Neuradventure V2",
      character_version: "1.0",
      extensions: {
        neuradventure: character,
      },
    },
  }
}

function parseRaceFromDescription(description: string): string {
  const raceMatch = description.match(/\bRace:\s*([^.]+)\./i)
  return raceMatch ? raceMatch[1].trim() : "Human"
}

function parseGenderFromDescription(description: string): string {
  const genderMatch = description.match(/\bGender:\s*([^.]+)\./i)
  return normalizeGender(
    genderMatch ? genderMatch[1].trim() : getServerDefaults().unknown.value,
    getServerDefaults().unknown.value,
  )
}

export function tavernCardToCharacter(card: TavernCardV2): TavernImportResult {
  // Lossless round-trip if neuradventure extension exists
  if (card.data.extensions?.neuradventure) {
    const raw = card.data.extensions.neuradventure as Record<string, unknown>
    const { inventory: _inventory, ...base } = raw as Record<string, unknown>
    void _inventory
    const appearance = (base as { appearance?: Record<string, unknown> }).appearance
    const character = { ...base } as Omit<MainCharacterState, "inventory"> & { appearance?: Record<string, unknown> }
    if (appearance && typeof appearance === "object") {
      if (!character.baseline_appearance) {
        character.baseline_appearance = String(appearance.baseline_appearance ?? "")
      }
      if (!character.current_appearance) {
        character.current_appearance = String(appearance.current_appearance ?? character.baseline_appearance ?? "")
      }
      if (!character.current_clothing) {
        character.current_clothing = String(appearance.current_clothing ?? "")
      }
      delete character.appearance
    }
    if (!Array.isArray(character.major_flaws)) character.major_flaws = []
    return {
      character: character as Omit<MainCharacterState, "inventory">,
      needs_review: false,
      source: "neuradventure",
    }
  }

  // Parse from ST card fields
  const description = card.data.description || ""
  const personality = card.data.personality || ""
  const rawTraits = personality
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean)

  const matchedTraits: string[] = []
  const customTraits: string[] = []
  for (const trait of rawTraits) {
    const canonical = npcTraitLookup.get(trait.toLowerCase())
    if (canonical) {
      if (!matchedTraits.includes(canonical)) matchedTraits.push(canonical)
    } else if (!customTraits.includes(trait)) {
      customTraits.push(trait)
    }
  }
  const traits = [...matchedTraits, ...customTraits].slice(0, 5)

  // Extract baseline description + appearance from description field
  const descLines = description
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
  const contentLines = descLines.filter((l) => !l.match(/^(Race|Gender):/i))
  let baselineAppearance = getServerDefaults().unknown.appearance
  for (const line of contentLines) {
    const appearanceMatch = line.match(/^Appearance:\s*(.+)$/i)
    if (appearanceMatch) {
      baselineAppearance = appearanceMatch[1].trim() || baselineAppearance
    }
  }

  const sourceText = [
    `Name: ${card.data.name || getServerDefaults().unknown.value}`,
    description ? `Description: ${description}` : null,
    personality ? `Personality: ${personality}` : null,
    card.data.scenario ? `Scenario: ${card.data.scenario}` : null,
    card.data.tags?.length ? `Tags: ${card.data.tags.join(", ")}` : null,
  ]
    .filter(Boolean)
    .join("\n")

  return {
    character: {
      name: card.data.name || getServerDefaults().unknown.value,
      race: parseRaceFromDescription(description),
      gender: parseGenderFromDescription(description),
      current_location: getServerDefaults().unknown.location,
      baseline_appearance: baselineAppearance,
      current_appearance: baselineAppearance,
      current_clothing: getServerDefaults().unknown.clothing,
      personality_traits: traits.length >= 2 ? traits : getServerDefaults().fallbackTraits,
      major_flaws: [],
      quirks: card.data.tags?.slice(0, 6) ?? [],
      perks: [],
    },
    needs_review: true,
    source: "tavern",
    source_text: sourceText || undefined,
  }
}
