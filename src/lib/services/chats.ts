import { AppError } from "@/errors"
import * as db from "@/engine/core/db"
import { getServerDefaults } from "@/engine/core/strings"
import {
  buildChatMessages,
  buildChatStopTokens,
  sanitizeChatReply,
  type ChatMember,
  type ChatMessage,
} from "@/engine/llm/chat"
import { generateChatReply } from "@/engine/llm"
import { createOrGetSession, publishComplete, publishError, publishPreview } from "@/engine/streaming/hub"
import {
  chatToPlaintext,
  chatToTavernJSONL,
  TavernCardV2Schema,
  type TavernCardV2,
} from "@/engine/utils/converters/tavern"
import type {
  ChatCancelResult,
  ChatContinueResult,
  ChatRegenerateResult,
  ChatSendResult,
  ChatSetNextSpeakerResult,
  ChatUndoCancelResult,
  ChatUpdateMessageResult,
  ChatUpdateResult,
} from "@/shared/api-types"
import type { ChatDetail, ChatMessage as ChatMessagePayload, ChatSummary } from "@/shared/types"

const inFlight = new Map<string, Promise<unknown>>()

function downloadText(filename: string, text: string, mime: string): void {
  if (typeof window === "undefined") return
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1500)
}

function parseMemberState(raw: string): db.ChatMemberState | null {
  try {
    return JSON.parse(raw) as db.ChatMemberState
  } catch {
    return null
  }
}

function memberNameFromState(state: db.ChatMemberState | null): string {
  const defaults = getServerDefaults()
  if (!state) return defaults.unknown.value
  return state.name?.trim() || defaults.unknown.value
}

function resolveMemberState(member: db.ChatMemberRow): db.ChatMemberState {
  const parsed = parseMemberState(member.state_json)
  if (parsed) return parsed
  const defaults = getServerDefaults()
  return {
    name: defaults.unknown.value,
    race: "",
    gender: "",
    general_description: defaults.unknown.generalDescription,
    current_location: "",
    baseline_appearance: "",
    current_appearance: "",
    current_clothing: "",
    personality_traits: [],
    major_flaws: [],
    quirks: [],
    perks: [],
  }
}

function buildMessagePayload(message: db.ChatMessageRow, members: db.ChatMemberRow[]): ChatMessagePayload {
  if (message.role === "system") {
    return {
      id: message.id,
      message_index: message.message_index,
      speaker_member_id: message.speaker_member_id,
      speaker_name: "System",
      role: message.role,
      content: message.content,
      created_at: message.created_at,
    }
  }
  const member = members.find((m) => m.id === message.speaker_member_id)
  const state = member ? parseMemberState(member.state_json) : null
  return {
    id: message.id,
    message_index: message.message_index,
    speaker_member_id: message.speaker_member_id,
    speaker_name: memberNameFromState(state),
    role: message.role,
    content: message.content,
    created_at: message.created_at,
  }
}

function buildChatHistory(members: db.ChatMemberRow[], messages: db.ChatMessageRow[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role === "system") return { speakerName: "System", content: m.content }
    const member = members.find((memberRow) => memberRow.id === m.speaker_member_id)
    const state = member ? parseMemberState(member.state_json) : null
    return {
      speakerName: memberNameFromState(state),
      content: m.content,
    }
  })
}

function buildChatMembersForPrompt(members: db.ChatMemberRow[]): ChatMember[] {
  const defaults = getServerDefaults()
  return members.map((member) => ({
    id: member.id,
    role: member.role,
    sort_order: member.sort_order,
    state:
      parseMemberState(member.state_json) ??
      ({
        name: memberNameFromState(null),
        race: "",
        gender: "",
        general_description: defaults.unknown.generalDescription,
        current_location: "",
        baseline_appearance: "",
        current_appearance: "",
        current_clothing: "",
        personality_traits: [],
        major_flaws: [],
        quirks: [],
        perks: [],
      } as db.ChatMemberState),
  }))
}

function listAiMembers(members: db.ChatMemberRow[]) {
  return members.filter((m) => m.role === "ai").sort((a, b) => a.sort_order - b.sort_order)
}

function resolveSpeakerCard(member: db.ChatMemberRow): TavernCardV2 | null {
  if (!member.character_id) return null
  const row = db.getCharacterCard(member.character_id)
  if (!row) return null
  try {
    const stored = JSON.parse(row.card_json) as unknown
    return TavernCardV2Schema.parse(stored)
  } catch {
    return null
  }
}

function isProbablyOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch failed")
}

function getCachedOrInFlight<T>(requestId: string, kind: string): { cached?: T; inflight?: Promise<T> } {
  const cached = db.getRequestResult(requestId)
  if (cached) {
    if (cached.kind !== kind) throw new AppError(409, `request_id already used for: ${cached.kind}`)
    return { cached: JSON.parse(cached.response_json) as T }
  }
  const inflight = inFlight.get(requestId)
  return inflight ? { inflight: inflight as Promise<T> } : {}
}

export const chats = {
  list: async (): Promise<ChatSummary[]> => {
    const rows = db.listChats()
    return rows.map((row) => {
      const members = db.listChatMembers(row.id)
      const names = members.map((m) => memberNameFromState(parseMemberState(m.state_json)))
      const player = members.find((m) => m.role === "player")
      const playerName = player ? memberNameFromState(parseMemberState(player.state_json)) : ""
      return {
        id: row.id,
        title: row.title,
        message_count: row.message_count,
        updated_at: row.updated_at,
        participants: names,
        player_name: playerName,
      }
    })
  },

  get: async (id: number): Promise<ChatDetail> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")
    const canceled = db.getCanceledChatExchange(id)
    const members = db.listChatMembers(id)
    return {
      id: chat.id,
      title: chat.title,
      speaker_strategy: chat.speaker_strategy,
      next_speaker_index: chat.next_speaker_index,
      can_undo_cancel: !!canceled,
      created_at: chat.created_at,
      updated_at: chat.updated_at,
      members: members.map((m) => {
        const state = parseMemberState(m.state_json)
        return {
          id: m.id,
          role: m.role,
          member_kind: m.member_kind,
          character_id: m.character_id,
          sort_order: m.sort_order,
          name: memberNameFromState(state),
        }
      }),
    }
  },

  messages: async (id: number): Promise<ChatMessagePayload[]> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")
    const members = db.listChatMembers(id)
    const messages = db.listChatMessages(id)
    return messages.map((m) => buildMessagePayload(m, members))
  },

  update: async (id: number, data: { title?: string }): Promise<ChatUpdateResult> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")
    db.updateChat(id, { title: data.title?.trim() })
    return { ok: true }
  },

  delete: async (id: number): Promise<{ ok: boolean }> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")
    db.deleteChat(id)
    return { ok: true }
  },

  exportAndDownload: async (
    id: number,
    format: "neuradventure" | "tavern" | "plaintext" = "neuradventure",
  ): Promise<void> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")
    const members = db.listChatMembers(id)
    const messages = db.listChatMessages(id)

    const memberNameById = new Map<number, string>()
    const memberStateById = new Map<number, db.ChatMemberState>()

    for (const member of members) {
      const state = resolveMemberState(member)
      memberStateById.set(member.id, state)
      memberNameById.set(member.id, memberNameFromState(state))
    }

    const defaults = getServerDefaults()
    const messageSummaries = messages.map((message) => {
      const speakerName =
        message.role === "system" ? "System" : (memberNameById.get(message.speaker_member_id) ?? defaults.unknown.value)
      return {
        role: message.role,
        content: message.content,
        created_at: message.created_at,
        speaker_name: speakerName,
        speaker_member_id: message.speaker_member_id,
        message_index: message.message_index,
      }
    })

    const playerMember = members.find((member) => member.role === "player")
    const playerName = playerMember
      ? (memberNameById.get(playerMember.id) ?? defaults.unknown.value)
      : defaults.unknown.value

    if (format === "tavern") {
      const jsonl = chatToTavernJSONL(chat, messageSummaries, playerName)
      downloadText(`chat-${id}.jsonl`, jsonl, "application/x-jsonlines")
      return
    }

    if (format === "plaintext") {
      const text = chatToPlaintext(chat, messageSummaries)
      downloadText(`chat-${id}.txt`, text, "text/plain; charset=utf-8")
      return
    }

    const data = JSON.stringify(
      {
        title: chat.title,
        speaker_strategy: chat.speaker_strategy,
        next_speaker_index: chat.next_speaker_index,
        created_at: chat.created_at,
        updated_at: chat.updated_at,
        members: members.map((member) => ({
          id: member.id,
          role: member.role,
          member_kind: member.member_kind,
          character_id: member.character_id,
          sort_order: member.sort_order,
          state: memberStateById.get(member.id) ?? resolveMemberState(member),
        })),
        messages: messageSummaries.map((message) => ({
          message_index: message.message_index,
          speaker_member_id: message.speaker_member_id,
          role: message.role,
          content: message.content,
          created_at: message.created_at,
        })),
        exported_at: new Date().toISOString(),
      },
      null,
      2,
    )
    downloadText(`chat-${id}.json`, data, "application/json")
  },

  updateMessage: async (chatId: number, messageId: number, content: string): Promise<ChatUpdateMessageResult> => {
    const message = db.getChatMessage(messageId)
    if (!message || message.chat_id !== chatId) throw new AppError(404, "Message not found")
    const trimmed = content.trim()
    if (!trimmed) throw new AppError(400, "Message content is required")
    db.updateChatMessage(messageId, trimmed)
    db.clearCanceledChatExchange(chatId)
    const members = db.listChatMembers(chatId)
    const updated = db.getChatMessage(messageId)
    if (!updated) throw new AppError(500, "Failed to update message")
    return { ok: true, message: buildMessagePayload(updated, members) }
  },

  deleteMessage: async (chatId: number, messageId: number): Promise<{ ok: boolean }> => {
    const message = db.getChatMessage(messageId)
    if (!message || message.chat_id !== chatId) throw new AppError(404, "Message not found")
    db.deleteChatMessage(messageId)
    db.clearCanceledChatExchange(chatId)
    return { ok: true }
  },

  create: async (data: {
    title?: string
    members: Array<{
      role: "player" | "ai"
      member_kind: "character" | "npc"
      character_id?: number | null
      state: db.ChatMemberState
    }>
    seed_greeting?: { speaker_sort_order: number; content: string }
  }): Promise<{ id: number }> => {
    const members = data.members
    const playerMembers = members.filter((m) => m.role === "player")
    const aiMembers = members.filter((m) => m.role === "ai")
    if (playerMembers.length !== 1) throw new AppError(400, "Exactly one player member is required")
    if (aiMembers.length < 1) throw new AppError(400, "At least one AI member is required")

    if (data.seed_greeting) {
      const index = data.seed_greeting.speaker_sort_order
      const seedTarget = members[index]
      if (!seedTarget) throw new AppError(400, "seed_greeting.speaker_sort_order is out of range")
      if (seedTarget.role !== "ai") throw new AppError(400, "seed_greeting target must be an AI member")
    }

    const chatId = db.createChat(
      data.title?.trim() ?? "",
      "round_robin",
      0,
      members.map((member, index) => ({
        role: member.role,
        member_kind: member.member_kind,
        character_id: member.character_id ?? null,
        state: member.state,
        sort_order: index,
      })),
    )

    if (data.seed_greeting) {
      const createdMembers = db.listChatMembers(chatId)
      const speaker = createdMembers.find((m) => m.sort_order === data.seed_greeting?.speaker_sort_order)
      const player = createdMembers.find((m) => m.role === "player")
      if (speaker && speaker.role === "ai" && player) {
        const playerName = memberNameFromState(parseMemberState(player.state_json))
        const speakerName = memberNameFromState(parseMemberState(speaker.state_json))
        const seeded = data.seed_greeting.content.replaceAll("{{user}}", playerName).replaceAll("{{char}}", speakerName)
        const messageIndex = db.getNextChatMessageIndex(chatId)
        db.appendChatMessage(chatId, messageIndex, speaker.id, "assistant", seeded)
      }
    }

    return { id: chatId }
  },

  send: async (id: number, content: string, requestId?: string): Promise<ChatSendResult> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")

    const members = db.listChatMembers(id)
    const playerMember = members.find((m) => m.role === "player")
    if (!playerMember) throw new AppError(400, "Chat has no player member")
    const aiMembers = listAiMembers(members)
    if (aiMembers.length === 0) throw new AppError(400, "Chat has no AI members")

    const trimmedContent = content.trim()
    if (!trimmedContent) throw new AppError(400, "Message content is required")

    const playerMessageIndex = db.getNextChatMessageIndex(id)
    const playerMessageId = db.appendChatMessage(id, playerMessageIndex, playerMember.id, "user", trimmedContent)
    db.clearCanceledChatExchange(id)

    const safeIndex = chat.next_speaker_index % aiMembers.length
    const nextSpeaker = aiMembers[safeIndex]
    const nextSpeakerState = parseMemberState(nextSpeaker.state_json)
    const nextSpeakerName = memberNameFromState(nextSpeakerState)

    const history = buildChatHistory(members, db.listChatMessages(id))
    const chatMembersForPrompt = buildChatMembersForPrompt(members)

    const stopTokens = buildChatStopTokens(chatMembersForPrompt.map((member) => member.state.name))
    const speakerCard = resolveSpeakerCard(nextSpeaker)
    const messages = buildChatMessages(chatMembersForPrompt, history, nextSpeakerName, { speakerCard })

    const trimmedRequestId = requestId?.trim() || undefined
    try {
      if (trimmedRequestId) {
        const existing = getCachedOrInFlight<ChatSendResult>(trimmedRequestId, "chat.send")
        if (existing.cached) return existing.cached
        if (existing.inflight) return await existing.inflight
      }

      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!trimmedRequestId
      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "chat.reply")

      const task = (async () => {
        const rawReply = await generateChatReply(messages, stopTokens, {
          onText:
            shouldStream && trimmedRequestId
              ? (text) => publishPreview(trimmedRequestId, { content: text })
              : undefined,
        })
        const replyText = sanitizeChatReply(rawReply, nextSpeakerName)
        if (!replyText) throw new Error("LLM returned empty response")

        const aiMessageIndex = playerMessageIndex + 1
        const aiMessageId = db.appendChatMessage(id, aiMessageIndex, nextSpeaker.id, "assistant", replyText)
        const nextIndex = (safeIndex + 1) % aiMembers.length
        db.advanceChatSpeaker(id, nextIndex)

        const playerMessage = db.getChatMessage(playerMessageId)
        const aiMessage = db.getChatMessage(aiMessageId)
        if (!playerMessage || !aiMessage) throw new Error("Failed to persist chat messages")

        return {
          player_message: buildMessagePayload(playerMessage, members),
          ai_message: buildMessagePayload(aiMessage, members),
          next_speaker_index: nextIndex,
        } satisfies ChatSendResult
      })()

      if (trimmedRequestId) inFlight.set(trimmedRequestId, task)
      try {
        const result = await task
        if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "chat.send", result)
        if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
        return result
      } finally {
        if (trimmedRequestId) inFlight.delete(trimmedRequestId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      if (trimmedRequestId && db.getSettings().streamingEnabled) publishError(trimmedRequestId, message)
      if (isProbablyOfflineError(err) || message.includes("ECONNREFUSED")) {
        throw new AppError(
          503,
          "LLM request failed. Are you offline, is the LLM URL blocked by CORS, or is KoboldCpp not running?",
        )
      }
      throw new AppError(500, "LLM generation failed: " + message)
    }
  },

  continue: async (id: number, requestId?: string): Promise<ChatContinueResult> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")

    const members = db.listChatMembers(id)
    const aiMembers = listAiMembers(members)
    if (aiMembers.length === 0) throw new AppError(400, "Chat has no AI members")

    const safeIndex = chat.next_speaker_index % aiMembers.length
    const nextSpeaker = aiMembers[safeIndex]
    const nextSpeakerState = parseMemberState(nextSpeaker.state_json)
    const nextSpeakerName = memberNameFromState(nextSpeakerState)

    const history = buildChatHistory(members, db.listChatMessages(id))
    const chatMembersForPrompt = buildChatMembersForPrompt(members)
    const stopTokens = buildChatStopTokens(chatMembersForPrompt.map((member) => member.state.name))
    const speakerCard = resolveSpeakerCard(nextSpeaker)
    const messages = buildChatMessages(chatMembersForPrompt, history, nextSpeakerName, {
      continueWithoutPlayer: true,
      speakerCard,
    })

    const trimmedRequestId = requestId?.trim() || undefined
    try {
      if (trimmedRequestId) {
        const existing = getCachedOrInFlight<ChatContinueResult>(trimmedRequestId, "chat.continue")
        if (existing.cached) return existing.cached
        if (existing.inflight) return await existing.inflight
      }

      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!trimmedRequestId
      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "chat.reply")

      const task = (async () => {
        const rawReply = await generateChatReply(messages, stopTokens, {
          onText:
            shouldStream && trimmedRequestId
              ? (text) => publishPreview(trimmedRequestId, { content: text })
              : undefined,
        })
        const replyText = sanitizeChatReply(rawReply, nextSpeakerName)
        if (!replyText) throw new Error("LLM returned empty response")

        const aiMessageIndex = db.getNextChatMessageIndex(id)
        const aiMessageId = db.appendChatMessage(id, aiMessageIndex, nextSpeaker.id, "assistant", replyText)
        const nextIndex = (safeIndex + 1) % aiMembers.length
        db.advanceChatSpeaker(id, nextIndex)
        db.clearCanceledChatExchange(id)

        const aiMessage = db.getChatMessage(aiMessageId)
        if (!aiMessage) throw new Error("Failed to persist chat message")

        return {
          ai_message: buildMessagePayload(aiMessage, members),
          next_speaker_index: nextIndex,
        } satisfies ChatContinueResult
      })()

      if (trimmedRequestId) inFlight.set(trimmedRequestId, task)
      try {
        const result = await task
        if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "chat.continue", result)
        if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
        return result
      } finally {
        if (trimmedRequestId) inFlight.delete(trimmedRequestId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      if (trimmedRequestId && db.getSettings().streamingEnabled) publishError(trimmedRequestId, message)
      if (isProbablyOfflineError(err) || message.includes("ECONNREFUSED")) {
        throw new AppError(
          503,
          "LLM request failed. Are you offline, is the LLM URL blocked by CORS, or is KoboldCpp not running?",
        )
      }
      throw new AppError(500, "LLM generation failed: " + message)
    }
  },

  regenerateLast: async (id: number, requestId?: string): Promise<ChatRegenerateResult> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")

    const members = db.listChatMembers(id)
    const aiMembers = listAiMembers(members)
    if (aiMembers.length === 0) throw new AppError(400, "Chat has no AI members")

    const allMessages = db.listChatMessages(id)
    if (allMessages.length === 0) throw new AppError(400, "Chat has no messages")

    const lastMessage = allMessages[allMessages.length - 1]
    let history = allMessages
    let speakerMember = null as db.ChatMemberRow | null
    let replaced = false

    if (lastMessage.role === "assistant") {
      speakerMember = members.find((m) => m.id === lastMessage.speaker_member_id) ?? null
      history = allMessages.slice(0, -1)
      replaced = true
    } else {
      const safeIndex = chat.next_speaker_index % aiMembers.length
      speakerMember = aiMembers[safeIndex] ?? null
    }

    if (!speakerMember) throw new AppError(500, "Failed to resolve speaker")

    const speakerState = parseMemberState(speakerMember.state_json)
    const speakerName = memberNameFromState(speakerState)
    const chatMembersForPrompt = buildChatMembersForPrompt(members)
    const stopTokens = buildChatStopTokens(chatMembersForPrompt.map((member) => member.state.name))
    const speakerCard = resolveSpeakerCard(speakerMember)
    const prompt = buildChatMessages(chatMembersForPrompt, buildChatHistory(members, history), speakerName, {
      speakerCard,
    })

    const trimmedRequestId = requestId?.trim() || undefined
    try {
      if (trimmedRequestId) {
        const existing = getCachedOrInFlight<ChatRegenerateResult>(trimmedRequestId, "chat.regenerate")
        if (existing.cached) return existing.cached
        if (existing.inflight) return await existing.inflight
      }

      const streamingEnabled = db.getSettings().streamingEnabled
      const shouldStream = streamingEnabled && !!trimmedRequestId
      if (shouldStream && trimmedRequestId) createOrGetSession(trimmedRequestId, "chat.reply")

      const task = (async () => {
        const rawReply = await generateChatReply(prompt, stopTokens, {
          onText:
            shouldStream && trimmedRequestId
              ? (text) => publishPreview(trimmedRequestId, { content: text })
              : undefined,
        })
        const replyText = sanitizeChatReply(rawReply, speakerName)
        if (!replyText) throw new Error("LLM returned empty response")

        let aiMessageId: number
        let nextIndex = chat.next_speaker_index

        if (replaced) {
          db.updateChatMessage(lastMessage.id, replyText)
          aiMessageId = lastMessage.id
        } else {
          const aiMessageIndex = db.getNextChatMessageIndex(id)
          aiMessageId = db.appendChatMessage(id, aiMessageIndex, speakerMember.id, "assistant", replyText)
          const speakerIndex = aiMembers.findIndex((m) => m.id === speakerMember?.id)
          nextIndex = speakerIndex >= 0 ? (speakerIndex + 1) % aiMembers.length : chat.next_speaker_index
          db.advanceChatSpeaker(id, nextIndex)
        }

        db.clearCanceledChatExchange(id)
        const aiMessage = db.getChatMessage(aiMessageId)
        if (!aiMessage) throw new Error("Failed to persist chat message")

        return {
          ai_message: buildMessagePayload(aiMessage, members),
          next_speaker_index: nextIndex,
          replaced,
        } satisfies ChatRegenerateResult
      })()

      if (trimmedRequestId) inFlight.set(trimmedRequestId, task)
      try {
        const result = await task
        if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "chat.regenerate", result)
        if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
        return result
      } finally {
        if (trimmedRequestId) inFlight.delete(trimmedRequestId)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error"
      if (trimmedRequestId && db.getSettings().streamingEnabled) publishError(trimmedRequestId, message)
      if (isProbablyOfflineError(err) || message.includes("ECONNREFUSED")) {
        throw new AppError(
          503,
          "LLM request failed. Are you offline, is the LLM URL blocked by CORS, or is KoboldCpp not running?",
        )
      }
      throw new AppError(500, "LLM generation failed: " + message)
    }
  },

  cancelLast: async (id: number): Promise<ChatCancelResult> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")
    const members = db.listChatMembers(id)
    const aiMembers = listAiMembers(members)
    const messages = db.listChatMessages(id)
    if (messages.length === 0) throw new AppError(400, "Chat has no messages")

    const last = messages[messages.length - 1]
    const prev = messages.length > 1 ? messages[messages.length - 2] : null
    const toRemove: db.ChatMessageRow[] = []

    if (last.role === "assistant" && prev && prev.role === "user") {
      toRemove.push(prev, last)
    } else {
      toRemove.push(last)
    }

    const removedIds = toRemove.map((m) => m.id)
    const payload: db.CanceledChatExchangePayload = {
      messages: toRemove.map((m) => ({
        message_index: m.message_index,
        speaker_member_id: m.speaker_member_id,
        role: m.role,
        content: m.content,
      })),
      next_speaker_index: chat.next_speaker_index,
    }

    for (const msg of toRemove) db.deleteChatMessage(msg.id)

    let nextIndex = chat.next_speaker_index
    const lastAssistant = toRemove.find((m) => m.role === "assistant")
    if (lastAssistant && aiMembers.length > 0) {
      const assistantIndex = aiMembers.findIndex((m) => m.id === lastAssistant.speaker_member_id)
      if (assistantIndex >= 0) {
        nextIndex = assistantIndex
        db.updateChatNextSpeaker(id, nextIndex)
      }
    }

    db.setCanceledChatExchange(id, payload)
    return { removed_ids: removedIds, next_speaker_index: nextIndex }
  },

  undoCancel: async (id: number): Promise<ChatUndoCancelResult> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")
    const payload = db.getCanceledChatExchange(id)
    if (!payload) throw new AppError(400, "Nothing to undo")

    const members = db.listChatMembers(id)
    const inserted: db.ChatMessageRow[] = []
    const sorted = [...payload.messages].sort((a, b) => a.message_index - b.message_index)

    for (const msg of sorted) {
      const mid = db.appendChatMessage(id, msg.message_index, msg.speaker_member_id, msg.role, msg.content)
      const restored = db.getChatMessage(mid)
      if (restored) inserted.push(restored)
    }

    db.updateChatNextSpeaker(id, payload.next_speaker_index)
    db.clearCanceledChatExchange(id)

    return {
      messages: inserted.map((m) => buildMessagePayload(m, members)),
      next_speaker_index: payload.next_speaker_index,
    }
  },

  setNextSpeaker: async (id: number, speakerMemberId: number): Promise<ChatSetNextSpeakerResult> => {
    const chat = db.getChat(id)
    if (!chat) throw new AppError(404, "Chat not found")
    const members = db.listChatMembers(id)
    const aiMembers = listAiMembers(members)
    const idx = aiMembers.findIndex((m) => m.id === speakerMemberId)
    if (idx < 0) throw new AppError(404, "Speaker not found")
    db.updateChatNextSpeaker(id, idx)
    return { next_speaker_index: idx }
  },
}
