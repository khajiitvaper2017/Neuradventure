import type { MainCharacterState } from "../../core/models.js"
import type { ChatMessageRow, ChatRow, TurnRow } from "../../core/db.js"
import { npcTraitLookup } from "../../schemas/npc-traits.js"
import { getServerDefaults } from "../../core/strings.js"
import { normalizeGender } from "../../schemas/normalizers.js"

// ─── TavernCardV2 types ───────────────────────────────────────────────────────

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

// ─── Character Export ─────────────────────────────────────────────────────────

export function characterToTavernCard(
  character: MainCharacterState | Omit<MainCharacterState, "inventory">,
): TavernCardV2 {
  const descriptionLines: string[] = []
  const defaults = getServerDefaults()
  const race = character.race?.trim() || defaults.unknown.value
  const gender = character.gender?.trim() || defaults.unknown.value
  const baselineAppearance = character.appearance.baseline_appearance?.trim() || defaults.unknown.appearance

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

// ─── Character Import ─────────────────────────────────────────────────────────

export interface TavernImportResult {
  character: Omit<MainCharacterState, "inventory">
  needs_review: boolean
  source: "neuradventure" | "tavern"
  source_text?: string
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
    const character = { ...base } as Omit<MainCharacterState, "inventory">
    if (!Array.isArray(character.major_flaws)) character.major_flaws = []
    return { character, needs_review: false, source: "neuradventure" }
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
      appearance: {
        baseline_appearance: baselineAppearance,
        current_appearance: baselineAppearance,
        current_clothing: getServerDefaults().unknown.clothing,
      },
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

// ─── Story Export: SillyTavern JSONL ──────────────────────────────────────────

export interface STChatLine {
  user_name?: string
  character_name?: string
  create_date?: string
  name?: string
  is_user?: boolean
  send_date?: string
  mes?: string
}

export type ChatExportMessage = Pick<ChatMessageRow, "role" | "content" | "created_at"> & {
  speaker_name: string
}

export function storyToTavernJSONL(
  title: string,
  openingScenario: string,
  playerName: string,
  turns: TurnRow[],
): string {
  void title
  const lines: STChatLine[] = []
  const now = new Date().toISOString()

  // Header line
  lines.push({
    user_name: playerName,
    character_name: "Narrator",
    create_date: now,
  })

  // Opening scenario
  lines.push({
    name: "Narrator",
    is_user: false,
    send_date: now,
    mes: openingScenario,
  })

  for (const turn of turns) {
    // Player action
    lines.push({
      name: playerName,
      is_user: true,
      send_date: turn.created_at,
      mes: turn.player_input,
    })
    // Narrator response
    lines.push({
      name: "Narrator",
      is_user: false,
      send_date: turn.created_at,
      mes: turn.narrative_text,
    })
  }

  return lines.map((line) => JSON.stringify(line)).join("\n")
}

// ─── Chat Export: SillyTavern JSONL ───────────────────────────────────────────

export function chatToTavernJSONL(
  chat: Pick<ChatRow, "title" | "created_at" | "scenario">,
  messages: ChatExportMessage[],
  playerName?: string,
) {
  const lines: STChatLine[] = []
  const createdAt = chat.created_at || new Date().toISOString()
  const safeTitle = chat.title?.trim() || "Group Chat"
  const resolvedPlayerName =
    playerName?.trim() || messages.find((m) => m.role === "user")?.speaker_name || getServerDefaults().unknown.value

  lines.push({
    user_name: resolvedPlayerName,
    character_name: safeTitle,
    create_date: createdAt,
  })

  if (chat.scenario?.trim()) {
    lines.push({
      name: "System",
      is_user: false,
      send_date: createdAt,
      mes: chat.scenario.trim(),
    })
  }

  for (const message of messages) {
    lines.push({
      name: message.speaker_name || getServerDefaults().unknown.value,
      is_user: message.role === "user",
      send_date: message.created_at,
      mes: message.content,
    })
  }

  return lines.map((line) => JSON.stringify(line)).join("\n")
}

// ─── Story Export: Plaintext ──────────────────────────────────────────────────

export function storyToPlaintext(title: string, openingScenario: string, turns: TurnRow[]): string {
  const parts: string[] = [`# ${title}`, "", openingScenario]

  for (const turn of turns) {
    parts.push("")
    parts.push(`> ${turn.player_input}`)
    parts.push("")
    parts.push(turn.narrative_text)
  }

  return parts.join("\n")
}

// ─── Chat Export: Plaintext ───────────────────────────────────────────────────

export function chatToPlaintext(chat: Pick<ChatRow, "title" | "scenario">, messages: ChatExportMessage[]): string {
  const safeTitle = chat.title?.trim() || "Chat"
  const parts: string[] = [`# ${safeTitle}`]

  if (chat.scenario?.trim()) {
    parts.push("", chat.scenario.trim())
  }

  for (const message of messages) {
    parts.push("")
    parts.push(`${message.speaker_name || getServerDefaults().unknown.value}:`)
    parts.push(message.content)
  }

  return parts.join("\n")
}

// ─── Format detection ─────────────────────────────────────────────────────────

export function detectImportFormat(data: unknown): "neuradventure" | "tavern-card" | "tavern-jsonl" | "unknown" {
  if (typeof data === "string") {
    // JSONL check (first line is JSON with chat/meta fields)
    const firstLine = data.split("\n")[0]
    try {
      const parsed = JSON.parse(firstLine)
      if (
        ("is_user" in parsed && "mes" in parsed) ||
        "user_name" in parsed ||
        "character_name" in parsed ||
        "create_date" in parsed
      ) {
        return "tavern-jsonl"
      }
    } catch {
      // not JSONL
    }
    return "unknown"
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    if (obj.spec === "chara_card_v2") return "tavern-card"
    if (obj.title && obj.character && obj.world) return "neuradventure"
  }

  return "unknown"
}

// ─── Story Import: SillyTavern JSONL ─────────────────────────────────────────

export interface TavernChatImport {
  userName: string
  characterName: string
  openingScenario: string
  turns: Array<{ player_input: string; narrative_text: string }>
}

export function parseTavernJSONL(raw: string): TavernChatImport {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) throw new Error("Empty JSONL file")

  const parsed: STChatLine[] = lines.map((line, i) => {
    try {
      return JSON.parse(line) as STChatLine
    } catch {
      throw new Error(`Invalid JSON on line ${i + 1}`)
    }
  })

  let meta: STChatLine | null = null
  let messageLines = parsed
  if (parsed[0] && (parsed[0].user_name || parsed[0].character_name || parsed[0].create_date)) {
    meta = parsed[0]
    messageLines = parsed.slice(1)
    if (typeof meta.is_user === "boolean" || typeof meta.mes === "string") {
      messageLines = parsed
    }
  }

  const firstUser = messageLines.find((line) => line.is_user === true && typeof line.name === "string")
  const firstNarrator = messageLines.find((line) => line.is_user === false && typeof line.name === "string")

  const userName = meta?.user_name || firstUser?.name || "Player"
  const characterName = meta?.character_name || firstNarrator?.name || "Narrator"

  let openingScenario = ""
  const turns: Array<{ player_input: string; narrative_text: string }> = []
  let pendingUser: string | null = null
  let seenUser = false

  for (const line of messageLines) {
    const text = typeof line.mes === "string" ? line.mes.trim() : ""
    if (!text) continue

    if (line.is_user === true) {
      pendingUser = text
      seenUser = true
      continue
    }

    if (line.is_user === false) {
      if (!seenUser && !openingScenario) {
        openingScenario = text
        continue
      }
      if (pendingUser != null) {
        turns.push({ player_input: pendingUser, narrative_text: text })
        pendingUser = null
      } else if (!openingScenario) {
        openingScenario = text
      }
    }
  }

  if (!openingScenario) openingScenario = "Imported story."

  return { userName, characterName, openingScenario, turns }
}
