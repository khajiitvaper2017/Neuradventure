import OpenAI from "openai"
import type { MainCharacterState, NPCState } from "../core/models.js"
import { getChatPrompt } from "./config.js"
import { getServerDefaults } from "../core/strings.js"

export type ChatMemberState = Omit<MainCharacterState, "inventory"> | Omit<NPCState, "inventory">

export type ChatMember = {
  id: number
  role: "player" | "ai"
  state: ChatMemberState
  sort_order: number
}

export type ChatMessage = {
  speakerName: string
  content: string
}

const MAX_CHAT_HISTORY = 40

function formatMemberSummary(member: ChatMemberState): string {
  const defaults = getServerDefaults()
  const name = member.name || defaults.unknown.value
  const race = member.race || defaults.unknown.value
  const gender = member.gender || defaults.unknown.value
  const appearance = member.appearance?.baseline_appearance || defaults.unknown.appearance
  const traits = member.personality_traits?.join(", ") || defaults.unknown.value
  const quirks = member.quirks?.join(", ") || defaults.unknown.value
  const perks = member.perks?.join(", ") || defaults.unknown.value
  const flaws = member.major_flaws?.join(", ") || defaults.unknown.value

  return [
    `Name: ${name}`,
    `Race: ${race}`,
    `Gender: ${gender}`,
    `Appearance: ${appearance}`,
    `Personality: ${traits}`,
    `Quirks: ${quirks}`,
    `Perks: ${perks}`,
    `Flaws: ${flaws}`,
  ].join("\n")
}

export function buildChatMessages(
  scenario: string,
  members: ChatMember[],
  history: ChatMessage[],
  nextSpeakerName: string,
): OpenAI.ChatCompletionMessageParam[] {
  const trimmedHistory = history.slice(-MAX_CHAT_HISTORY)
  const participantBlock = members
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((member) => formatMemberSummary(member.state))
    .join("\n\n")

  const historyBlock = trimmedHistory.length
    ? trimmedHistory.map((line) => `${line.speakerName}: ${line.content}`).join("\n")
    : "(no messages yet)"

  const promptSections = [
    "=== Scenario ===",
    scenario?.trim() || "(none)",
    "",
    "=== Participants ===",
    participantBlock || "(none)",
    "",
    "=== Chat History ===",
    historyBlock,
    "",
    "=== Next Speaker ===",
    nextSpeakerName,
    "",
    `Reply as ${nextSpeakerName} with message text only.`,
  ]

  return [
    { role: "system", content: getChatPrompt() },
    { role: "user", content: promptSections.join("\n") },
  ]
}

export function buildChatStopTokens(names: string[]): string[] {
  const tokens: string[] = []
  for (const name of names) {
    const trimmed = name.trim()
    if (!trimmed) continue
    tokens.push(`\n${trimmed}:`)
  }
  return tokens
}

export function sanitizeChatReply(text: string, speakerName: string): string {
  let value = text.trim()
  if (!value) return value
  const escaped = speakerName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  const pattern = new RegExp(`^${escaped}:\\s*`, "i")
  value = value.replace(pattern, "")
  return value.trim()
}
