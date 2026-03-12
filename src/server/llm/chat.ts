import OpenAI from "openai"
import type { MainCharacterState, NPCState } from "../core/models.js"
import { getChatPrompt } from "./config.js"
import { getServerDefaults } from "../core/strings.js"
import { callLLMText } from "./call.js"

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
  const description =
    member.general_description?.trim() ||
    member.appearance?.baseline_appearance ||
    defaults.unknown.generalDescription ||
    defaults.unknown.appearance
  const traits = member.personality_traits?.join(", ") || defaults.unknown.value
  const quirks = member.quirks?.join(", ") || defaults.unknown.value
  const perks = member.perks?.join(", ") || defaults.unknown.value
  const flaws = member.major_flaws?.join(", ") || defaults.unknown.value

  return [
    `Name: ${name}`,
    `Race: ${race}`,
    `Gender: ${gender}`,
    `Description: ${description}`,
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
  options: { continueWithoutPlayer?: boolean } = {},
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
    options.continueWithoutPlayer ? "Player sent no new message; continue the conversation naturally." : null,
    options.continueWithoutPlayer ? "" : null,
    "=== Next Speaker ===",
    nextSpeakerName,
    "",
    `Reply as ${nextSpeakerName} with message text only.`,
  ].filter((line): line is string => line !== null)

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

export async function generateChatReply(
  messages: OpenAI.ChatCompletionMessageParam[],
  stopTokens: string[],
): Promise<string> {
  const cleanedStops = stopTokens.filter((token) => token.trim().length > 0)
  return callLLMText(messages, undefined, { disableRepetition: true, stop: cleanedStops })
}
