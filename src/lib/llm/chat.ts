import type { MainCharacterState, NPCState } from "@/types/models"
import { GenerateChatResponseSchema } from "@/types/models"
import type { GenerateChatResponse } from "@/types/api"
import { getChatPrompt, getGenerateChatPrompt } from "@/llm/config"
import { formatTemplate, getLlmStrings, getServerDefaults } from "@/utils/text/strings"
import { callLLMRaw, callLLMText } from "@/llm/call"
import type { ConversationRole } from "@/types/roles"
import { LlmRole } from "@/types/roles"
import type { TavernCard } from "@/utils/converters/tavern"
import { renderCharacterBook } from "@/utils/tavern/character-book"
import { wrapSection } from "@/llm/io/format"
import type { ChatCompletionMessageParam } from "@/llm/openai-types"

export type ChatMemberState = Omit<MainCharacterState, "inventory"> | Omit<NPCState, "inventory">

export type ChatMember = {
  id: number
  role: ConversationRole
  state: ChatMemberState
  sort_order: number
}

export type ChatMessage = {
  speakerName: string
  content: string
}

const MAX_CHAT_HISTORY = 40

function getExampleDialogText(card: TavernCard | null | undefined): string {
  if (!card) return ""
  const raw = card.data?.mes_example?.trim()
  return raw || ""
}

function formatMemberSummary(member: ChatMemberState): string {
  const llmStrings = getLlmStrings()
  const labels = llmStrings.characterContextLabels
  const defaults = getServerDefaults()
  const name = member.name || defaults.unknown.value
  const race = member.race || defaults.unknown.value
  const gender = member.gender || defaults.unknown.value
  const description =
    member.general_description?.trim() ||
    member.baseline_appearance ||
    defaults.unknown.generalDescription ||
    defaults.unknown.appearance
  const traits = member.personality_traits?.join(", ") || defaults.unknown.value
  const perks = member.perks?.join(", ") || defaults.unknown.value
  const flaws = member.major_flaws?.join(", ") || defaults.unknown.value

  return [
    formatTemplate(labels.name, { value: name }),
    formatTemplate(labels.race, { value: race }),
    formatTemplate(labels.gender, { value: gender }),
    formatTemplate(labels.generalDescription, { value: description }),
    formatTemplate(labels.personalityTraits, { value: traits }),
    formatTemplate(labels.perks, { value: perks }),
    formatTemplate(labels.majorFlaws, { value: flaws }),
  ].join("\n")
}

export function buildChatMessages(
  members: ChatMember[],
  history: ChatMessage[],
  nextSpeakerName: string,
  options: { continueWithoutPlayer?: boolean; speakerCard?: TavernCard | null } = {},
): ChatCompletionMessageParam[] {
  const llmStrings = getLlmStrings()
  const { sections, chatPrompt } = llmStrings
  const trimmedHistory = history.slice(-MAX_CHAT_HISTORY)
  const participantBlock = members
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((member) => formatMemberSummary(member.state))
    .join("\n\n")

  const baseSystemPrompt = getChatPrompt()
  const cardSystemPrompt = options.speakerCard?.data?.system_prompt?.trim() ?? ""
  const effectiveSystemPrompt = cardSystemPrompt
    ? cardSystemPrompt.includes("{{original}}")
      ? cardSystemPrompt.replaceAll("{{original}}", baseSystemPrompt)
      : cardSystemPrompt
    : baseSystemPrompt

  const postHistoryRaw = options.speakerCard?.data?.post_history_instructions?.trim() ?? ""
  const postHistory = postHistoryRaw
    ? postHistoryRaw.includes("{{original}}")
      ? postHistoryRaw.replaceAll("{{original}}", "")
      : postHistoryRaw
    : ""

  const exampleDialog = getExampleDialogText(options.speakerCard)

  const characterBook = options.speakerCard?.data?.character_book
  const scanDepth =
    characterBook && typeof characterBook.scan_depth === "number" && characterBook.scan_depth > 0
      ? Math.min(characterBook.scan_depth, trimmedHistory.length)
      : trimmedHistory.length
  const scannedHistory = scanDepth > 0 ? trimmedHistory.slice(-scanDepth) : []
  const scanText = scannedHistory.map((m) => `${m.speakerName}: ${m.content}`).join("\n")
  const renderedBook = characterBook
    ? renderCharacterBook(characterBook, scanText)
    : { before_char: null, after_char: null }

  const historyBlock = trimmedHistory.length
    ? trimmedHistory.map((line) => `${line.speakerName}: ${line.content}`).join("\n")
    : chatPrompt.emptyHistory

  const promptSections = [
    renderedBook.before_char
      ? wrapSection(sections.chatCharacterBookBeforeParticipants, renderedBook.before_char)
      : null,
    wrapSection(sections.chatParticipants, participantBlock || chatPrompt.emptyParticipants),
    renderedBook.after_char ? wrapSection(sections.chatCharacterBookAfterParticipants, renderedBook.after_char) : null,
    exampleDialog ? wrapSection(sections.chatExampleDialogs, exampleDialog) : null,
    wrapSection(sections.chatHistory, historyBlock || chatPrompt.emptyHistory),
    postHistory ? wrapSection(sections.chatPostHistoryInstructions, postHistory) : null,
    options.continueWithoutPlayer ? chatPrompt.continueWithoutPlayer : null,
    wrapSection(sections.chatNextSpeaker, nextSpeakerName),
    wrapSection(sections.chatReplyInstruction, formatTemplate(chatPrompt.replyInstruction, { nextSpeakerName })),
  ].filter((line): line is string => line !== null)

  return [
    { role: LlmRole.System, content: effectiveSystemPrompt },
    { role: LlmRole.User, content: promptSections.join("\n") },
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
  messages: ChatCompletionMessageParam[],
  stopTokens: string[],
  options: { onText?: (text: string) => void } = {},
): Promise<string> {
  const cleanedStops = stopTokens.filter((token) => token.trim().length > 0)
  return callLLMText(messages, undefined, {
    disableRepetition: true,
    stop: cleanedStops,
    requestName: "ChatReply",
    ...(options.onText ? { onText: options.onText } : {}),
  })
}

export async function generateChat(
  description: string,
  options: { onPreviewPatch?: (patch: Record<string, unknown>) => void } = {},
): Promise<GenerateChatResponse> {
  const prompt = getGenerateChatPrompt()
  const result = await callLLMRaw(
    [
      { role: LlmRole.System, content: prompt },
      { role: LlmRole.User, content: description.trim() },
    ],
    "GenerateChatResponse",
    GenerateChatResponseSchema,
    undefined,
    { disableRepetition: true, ...(options.onPreviewPatch ? { onPreviewPatch: options.onPreviewPatch } : {}) },
  )
  return result
}
