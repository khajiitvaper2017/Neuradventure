import { z } from "zod"
import type { MainCharacterState } from "@/engine/core/models"
import { npcTraitLookup } from "@/engine/schemas/npc-traits"
import { getServerDefaults } from "@/engine/core/strings"
import { normalizeGender } from "@/engine/schemas/normalizers"

const nullToUndefined = (value: unknown) => (value === null ? undefined : value)

const ExtensionsSchema = z.preprocess(
  nullToUndefined,
  z.record(z.string(), z.unknown()).optional().default({}).catch({}),
)
const OptionalStringSchema = z.preprocess(nullToUndefined, z.string().optional().default(""))
const OptionalStringArraySchema = z.preprocess(nullToUndefined, z.array(z.string()).optional().default([]))
const OptionalStringArrayNoDefaultSchema = z.preprocess(nullToUndefined, z.array(z.string()).optional())
const OptionalBoolSchema = z.preprocess(nullToUndefined, z.boolean().optional())
const OptionalBoolDefaultTrueSchema = z.preprocess(nullToUndefined, z.boolean().optional().default(true))
const OptionalIntDefaultZeroSchema = z.preprocess(nullToUndefined, z.number().int().optional().default(0))
const OptionalIntSchema = z.preprocess(nullToUndefined, z.number().int().optional())
const OptionalNumberSchema = z.preprocess(nullToUndefined, z.number().optional())

export const CharacterBookEntrySchema = z
  .object({
    keys: OptionalStringArraySchema,
    content: OptionalStringSchema,
    extensions: ExtensionsSchema,
    enabled: OptionalBoolDefaultTrueSchema,
    insertion_order: OptionalIntDefaultZeroSchema,
    case_sensitive: OptionalBoolSchema,
    name: z.preprocess(nullToUndefined, z.string().optional()),
    priority: OptionalNumberSchema,
    id: OptionalNumberSchema,
    comment: z.preprocess(nullToUndefined, z.string().optional()),
    selective: OptionalBoolSchema,
    secondary_keys: OptionalStringArrayNoDefaultSchema,
    constant: OptionalBoolSchema,
    position: z.preprocess(
      (value) => (value === "" || value === null ? undefined : value),
      z.enum(["before_char", "after_char"]).optional().default("before_char"),
    ),
  })
  .passthrough()

export const CharacterBookSchema = z
  .object({
    name: z.preprocess(nullToUndefined, z.string().optional()),
    description: z.preprocess(nullToUndefined, z.string().optional()),
    scan_depth: OptionalIntSchema,
    token_budget: OptionalIntSchema,
    recursive_scanning: OptionalBoolSchema,
    extensions: ExtensionsSchema,
    entries: z.preprocess(nullToUndefined, z.array(CharacterBookEntrySchema).optional().default([])),
  })
  .passthrough()

export const TavernCardV2Schema = z
  .object({
    spec: z.literal("chara_card_v2"),
    spec_version: z.preprocess(
      (value) => (value === null ? undefined : value === 2 || value === 2.0 ? "2.0" : value),
      z.literal("2.0").optional().default("2.0"),
    ),
    data: z
      .object({
        name: OptionalStringSchema,
        description: OptionalStringSchema,
        personality: OptionalStringSchema,
        scenario: OptionalStringSchema,
        first_mes: OptionalStringSchema,
        mes_example: OptionalStringSchema,

        // SpecV2 fields
        creator_notes: OptionalStringSchema,
        system_prompt: OptionalStringSchema,
        post_history_instructions: OptionalStringSchema,
        alternate_greetings: OptionalStringArraySchema,
        character_book: z.preprocess(nullToUndefined, CharacterBookSchema.optional()),

        // May-8 additions
        tags: OptionalStringArraySchema,
        creator: OptionalStringSchema,
        character_version: OptionalStringSchema,
        extensions: ExtensionsSchema,
      })
      .passthrough(),
  })
  .passthrough()

export type TavernCardV2 = z.infer<typeof TavernCardV2Schema>
export type TavernCard = TavernCardV2
export type CharacterBook = z.infer<typeof CharacterBookSchema>
export type CharacterBookEntry = z.infer<typeof CharacterBookEntrySchema>

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

  const { inventory: _inventory, ...characterWithoutInventory } = character as MainCharacterState
  void _inventory

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
      creator_notes: "",
      system_prompt: "",
      post_history_instructions: "",
      alternate_greetings: [],
      tags: [],
      creator: "Neuradventure V2",
      character_version: "1.0",
      extensions: {
        neuradventure: characterWithoutInventory,
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

function inferRaceFromTags(tags: string[], fallback: string): string {
  const map: Record<string, string> = {
    human: "Human",
    elf: "Elf",
    dwarf: "Dwarf",
    orc: "Orc",
    goblin: "Goblin",
    vampire: "Vampire",
    werewolf: "Werewolf",
    android: "Android",
    robot: "Robot",
  }
  const seen = new Set(tags.map((t) => t.trim().toLowerCase()).filter(Boolean))
  for (const [key, value] of Object.entries(map)) {
    if (seen.has(key)) return value
  }
  return fallback
}

function inferGenderFromTags(tags: string[], fallback: string): string {
  const normalized = tags.map((t) => t.trim().toLowerCase())
  if (normalized.includes("female")) return "Female"
  if (normalized.includes("male")) return "Male"
  return fallback
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
  const traits = [...matchedTraits, ...customTraits]

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

  const generalDescription = description.trim() || getServerDefaults().unknown.generalDescription

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
      race: (() => {
        const base = parseRaceFromDescription(description)
        const hasExplicit = /\bRace:\s*[^.]+\./i.test(description)
        return hasExplicit ? base : inferRaceFromTags(card.data.tags ?? [], base)
      })(),
      gender: (() => {
        const base = parseGenderFromDescription(description)
        const hasExplicit = /\bGender:\s*[^.]+\./i.test(description)
        return hasExplicit ? base : inferGenderFromTags(card.data.tags ?? [], base)
      })(),
      general_description: generalDescription,
      current_location: "",
      baseline_appearance: baselineAppearance,
      current_appearance: baselineAppearance,
      current_clothing: "",
      personality_traits: traits,
      major_flaws: [],
      quirks: [],
      perks: [],
      custom_fields: {},
    },
    needs_review: true,
    source: "tavern",
    source_text: sourceText,
  }
}
