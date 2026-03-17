import { AppError } from "@/errors"
import * as db from "@/engine/core/db"
import { buildChatMessages, buildChatStopTokens, sanitizeChatReply } from "@/engine/llm/chat"
import { generateChatReply } from "@/engine/llm"
import { createOrGetSession, publishComplete, publishError, publishPreview } from "@/engine/streaming/hub"
import type {
  ChatCancelResult,
  ChatContinueResult,
  ChatRegenerateResult,
  ChatSendResult,
  ChatSetNextSpeakerResult,
  ChatUndoCancelResult,
} from "@/shared/api-types"
import {
  buildChatMembersForPrompt,
  listAiMembers,
  memberNameFromState,
  parseMemberState,
  resolveSpeakerCard,
} from "@/services/chats/members"
import { buildChatHistory, buildMessagePayload } from "@/services/chats/messages"
import { clearInFlight, getCachedOrInFlight, setInFlight } from "@/services/requests/cache"
import { isProbablyOfflineError } from "@/services/requests/offline"

export async function send(id: number, content: string, requestId?: string): Promise<ChatSendResult> {
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
          shouldStream && trimmedRequestId ? (text) => publishPreview(trimmedRequestId, { content: text }) : undefined,
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

    if (trimmedRequestId) setInFlight(trimmedRequestId, task)
    try {
      const result = await task
      if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "chat.send", result)
      if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
      return result
    } finally {
      if (trimmedRequestId) clearInFlight(trimmedRequestId)
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
}

export async function continueChat(id: number, requestId?: string): Promise<ChatContinueResult> {
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
          shouldStream && trimmedRequestId ? (text) => publishPreview(trimmedRequestId, { content: text }) : undefined,
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

    if (trimmedRequestId) setInFlight(trimmedRequestId, task)
    try {
      const result = await task
      if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "chat.continue", result)
      if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
      return result
    } finally {
      if (trimmedRequestId) clearInFlight(trimmedRequestId)
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
}

export async function regenerateLast(id: number, requestId?: string): Promise<ChatRegenerateResult> {
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
          shouldStream && trimmedRequestId ? (text) => publishPreview(trimmedRequestId, { content: text }) : undefined,
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

    if (trimmedRequestId) setInFlight(trimmedRequestId, task)
    try {
      const result = await task
      if (trimmedRequestId) db.setRequestResult(trimmedRequestId, "chat.regenerate", result)
      if (shouldStream && trimmedRequestId) publishComplete(trimmedRequestId)
      return result
    } finally {
      if (trimmedRequestId) clearInFlight(trimmedRequestId)
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
}

export async function cancelLast(id: number): Promise<ChatCancelResult> {
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
}

export async function undoCancel(id: number): Promise<ChatUndoCancelResult> {
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
}

export async function setNextSpeaker(id: number, speakerMemberId: number): Promise<ChatSetNextSpeakerResult> {
  const chat = db.getChat(id)
  if (!chat) throw new AppError(404, "Chat not found")
  const members = db.listChatMembers(id)
  const aiMembers = listAiMembers(members)
  const idx = aiMembers.findIndex((m) => m.id === speakerMemberId)
  if (idx < 0) throw new AppError(404, "Speaker not found")
  db.updateChatNextSpeaker(id, idx)
  return { next_speaker_index: idx }
}
