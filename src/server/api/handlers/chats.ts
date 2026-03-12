import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import * as db from "../../core/db.js"
import {
  ChatIdRequestSchema,
  CreateChatRequestSchema,
  SendChatMessageRequestSchema,
  SetNextChatSpeakerRequestSchema,
  UpdateChatMessageRequestSchema,
  UpdateChatRequestSchema,
} from "../../core/models.js"
import { getServerDefaults } from "../../core/strings.js"
import { buildChatMessages, buildChatStopTokens, sanitizeChatReply } from "../../llm/chat.js"
import { generateChatReply } from "../../llm/index.js"
import { chatToPlaintext, chatToTavernJSONL } from "../../utils/converters/tavern.js"
import { badRequest, notFound, serverError } from "./http.js"

const chats = new Hono()

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
    current_location: "",
    appearance: {
      baseline_appearance: "",
      current_appearance: "",
      current_clothing: "",
    },
    personality_traits: [],
    major_flaws: [],
    quirks: [],
    perks: [],
  }
}

function buildMessagePayload(
  message: db.ChatMessageRow,
  members: db.ChatMemberRow[],
): {
  id: number
  message_index: number
  speaker_member_id: number
  speaker_name: string
  role: "user" | "assistant" | "system"
  content: string
  created_at: string
} {
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

function buildChatHistory(members: db.ChatMemberRow[], messages: db.ChatMessageRow[]) {
  return messages.map((m) => {
    const member = members.find((memberRow) => memberRow.id === m.speaker_member_id)
    const state = member ? parseMemberState(member.state_json) : null
    return {
      speakerName: memberNameFromState(state),
      content: m.content,
    }
  })
}

function buildChatMembersForPrompt(members: db.ChatMemberRow[]) {
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
        current_location: "",
        appearance: {
          baseline_appearance: "",
          current_appearance: "",
          current_clothing: "",
        },
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

chats.get("/", (c) => {
  const rows = db.listChats()
  const summaries = rows.map((row) => {
    const members = db.listChatMembers(row.id)
    const names = members.map((m) => memberNameFromState(parseMemberState(m.state_json)))
    const player = members.find((m) => m.role === "player")
    const playerName = player ? memberNameFromState(parseMemberState(player.state_json)) : ""
    return {
      id: row.id,
      title: row.title,
      scenario: row.scenario,
      message_count: row.message_count,
      updated_at: row.updated_at,
      participants: names,
      player_name: playerName,
    }
  })
  return c.json(summaries)
})

chats.get("/:id", (c) => {
  const id = Number(c.req.param("id"))
  const chat = db.getChat(id)
  if (!chat) return notFound(c, "Chat not found")
  const canceled = db.getCanceledChatExchange(id)
  const members = db.listChatMembers(id)
  return c.json({
    id: chat.id,
    title: chat.title,
    scenario: chat.scenario,
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
  })
})

chats.get("/:id/messages", (c) => {
  const id = Number(c.req.param("id"))
  const chat = db.getChat(id)
  if (!chat) return notFound(c, "Chat not found")
  const members = db.listChatMembers(id)
  const messages = db.listChatMessages(id)
  return c.json(messages.map((m) => buildMessagePayload(m, members)))
})

chats.put("/:id", zValidator("json", UpdateChatRequestSchema), (c) => {
  const id = Number(c.req.param("id"))
  const chat = db.getChat(id)
  if (!chat) return notFound(c, "Chat not found")
  const body = c.req.valid("json")
  db.updateChat(id, { title: body.title?.trim(), scenario: body.scenario?.trim() })
  return c.json({ ok: true })
})

chats.delete("/:id", (c) => {
  const id = Number(c.req.param("id"))
  const chat = db.getChat(id)
  if (!chat) return notFound(c, "Chat not found")
  db.deleteChat(id)
  return c.json({ ok: true })
})

// ─── Chat Export (multiple formats) ───────────────────────────────────────────

chats.get("/:id/export", (c) => {
  const id = Number(c.req.param("id"))
  const format = (c.req.query("format") || "neuradventure") as string
  const chat = db.getChat(id)
  if (!chat) return notFound(c, "Chat not found")

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
    return new Response(jsonl, {
      headers: {
        "Content-Type": "application/x-jsonlines",
        "Content-Disposition": `attachment; filename="chat-${id}.jsonl"`,
      },
    })
  }

  if (format === "plaintext") {
    const text = chatToPlaintext(chat, messageSummaries)
    return new Response(text, {
      headers: {
        "Content-Type": "text/plain; charset=utf-8",
        "Content-Disposition": `attachment; filename="chat-${id}.txt"`,
      },
    })
  }

  const data = JSON.stringify(
    {
      title: chat.title,
      scenario: chat.scenario,
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

  return new Response(data, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="chat-${id}.json"`,
    },
  })
})

chats.put("/:id/messages/:messageId", zValidator("json", UpdateChatMessageRequestSchema), (c) => {
  const chatId = Number(c.req.param("id"))
  const messageId = Number(c.req.param("messageId"))
  const message = db.getChatMessage(messageId)
  if (!message || message.chat_id !== chatId) return notFound(c, "Message not found")
  const body = c.req.valid("json")
  const trimmed = body.content.trim()
  if (!trimmed) return badRequest(c, "Message content is required")
  db.updateChatMessage(messageId, trimmed)
  db.clearCanceledChatExchange(chatId)
  const members = db.listChatMembers(chatId)
  const updated = db.getChatMessage(messageId)
  if (!updated) return c.json({ error: "Failed to update message" }, 500)
  return c.json({ ok: true, message: buildMessagePayload(updated, members) })
})

chats.delete("/:id/messages/:messageId", (c) => {
  const chatId = Number(c.req.param("id"))
  const messageId = Number(c.req.param("messageId"))
  const message = db.getChatMessage(messageId)
  if (!message || message.chat_id !== chatId) return notFound(c, "Message not found")
  db.deleteChatMessage(messageId)
  db.clearCanceledChatExchange(chatId)
  return c.json({ ok: true })
})

chats.post("/", zValidator("json", CreateChatRequestSchema), (c) => {
  const body = c.req.valid("json")
  const members = body.members
  const playerMembers = members.filter((m) => m.role === "player")
  const aiMembers = members.filter((m) => m.role === "ai")
  if (playerMembers.length !== 1) {
    return c.json({ error: "Exactly one player member is required" }, 400)
  }
  if (aiMembers.length < 1) {
    return c.json({ error: "At least one AI member is required" }, 400)
  }

  const chatId = db.createChat(
    body.title?.trim() ?? "",
    body.scenario?.trim() ?? "",
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
  return c.json({ id: chatId }, 201)
})

chats.post("/:id/messages", zValidator("json", SendChatMessageRequestSchema), async (c) => {
  const chatId = Number(c.req.param("id"))
  const body = c.req.valid("json")
  if (body.chat_id !== chatId) {
    return badRequest(c, "chat_id does not match path")
  }
  const chat = db.getChat(chatId)
  if (!chat) return notFound(c, "Chat not found")

  const members = db.listChatMembers(chatId)
  const playerMember = members.find((m) => m.role === "player")
  if (!playerMember) return badRequest(c, "Chat has no player member")

  const aiMembers = listAiMembers(members)
  if (aiMembers.length === 0) return badRequest(c, "Chat has no AI members")

  const trimmedContent = body.content.trim()
  if (!trimmedContent) return badRequest(c, "Message content is required")

  const playerMessageIndex = db.getNextChatMessageIndex(chatId)
  const playerMessageId = db.appendChatMessage(chatId, playerMessageIndex, playerMember.id, "user", trimmedContent)
  db.clearCanceledChatExchange(chatId)

  const safeIndex = chat.next_speaker_index % aiMembers.length
  const nextSpeaker = aiMembers[safeIndex]
  const nextSpeakerState = parseMemberState(nextSpeaker.state_json)
  const nextSpeakerName = memberNameFromState(nextSpeakerState)

  const history = buildChatHistory(members, db.listChatMessages(chatId))
  const chatMembersForPrompt = buildChatMembersForPrompt(members)

  const stopTokens = buildChatStopTokens(chatMembersForPrompt.map((member) => member.state.name))
  const messages = buildChatMessages(chat.scenario, chatMembersForPrompt, history, nextSpeakerName)

  try {
    const rawReply = await generateChatReply(messages, stopTokens)
    const replyText = sanitizeChatReply(rawReply, nextSpeakerName)
    if (!replyText) return serverError(c, "LLM returned empty response")

    const aiMessageIndex = playerMessageIndex + 1
    const aiMessageId = db.appendChatMessage(chatId, aiMessageIndex, nextSpeaker.id, "assistant", replyText)

    const nextIndex = (safeIndex + 1) % aiMembers.length
    db.advanceChatSpeaker(chatId, nextIndex)

    const playerMessage = db.getChatMessage(playerMessageId)
    const aiMessage = db.getChatMessage(aiMessageId)

    if (!playerMessage || !aiMessage) {
      return serverError(c, "Failed to persist chat messages")
    }

    return c.json({
      player_message: buildMessagePayload(playerMessage, members),
      ai_message: buildMessagePayload(aiMessage, members),
      next_speaker_index: nextIndex,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return c.json({ error: "KoboldCpp is not running. Please start KoboldCpp first." }, 503)
    }
    console.error("LLM error:", err)
    return serverError(c, "LLM generation failed: " + message)
  }
})

chats.post("/:id/continue", zValidator("json", ChatIdRequestSchema), async (c) => {
  const chatId = Number(c.req.param("id"))
  const body = c.req.valid("json")
  if (body.chat_id !== chatId) {
    return badRequest(c, "chat_id does not match path")
  }
  const chat = db.getChat(chatId)
  if (!chat) return notFound(c, "Chat not found")

  const members = db.listChatMembers(chatId)
  const aiMembers = listAiMembers(members)
  if (aiMembers.length === 0) return badRequest(c, "Chat has no AI members")

  const safeIndex = chat.next_speaker_index % aiMembers.length
  const nextSpeaker = aiMembers[safeIndex]
  const nextSpeakerState = parseMemberState(nextSpeaker.state_json)
  const nextSpeakerName = memberNameFromState(nextSpeakerState)

  const history = buildChatHistory(members, db.listChatMessages(chatId))
  const chatMembersForPrompt = buildChatMembersForPrompt(members)
  const stopTokens = buildChatStopTokens(chatMembersForPrompt.map((member) => member.state.name))
  const messages = buildChatMessages(chat.scenario, chatMembersForPrompt, history, nextSpeakerName, {
    continueWithoutPlayer: true,
  })

  try {
    const rawReply = await generateChatReply(messages, stopTokens)
    const replyText = sanitizeChatReply(rawReply, nextSpeakerName)
    if (!replyText) return serverError(c, "LLM returned empty response")

    const aiMessageIndex = db.getNextChatMessageIndex(chatId)
    const aiMessageId = db.appendChatMessage(chatId, aiMessageIndex, nextSpeaker.id, "assistant", replyText)
    const nextIndex = (safeIndex + 1) % aiMembers.length
    db.advanceChatSpeaker(chatId, nextIndex)
    db.clearCanceledChatExchange(chatId)

    const aiMessage = db.getChatMessage(aiMessageId)
    if (!aiMessage) {
      return serverError(c, "Failed to persist chat message")
    }

    return c.json({
      ai_message: buildMessagePayload(aiMessage, members),
      next_speaker_index: nextIndex,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return c.json({ error: "KoboldCpp is not running. Please start KoboldCpp first." }, 503)
    }
    console.error("LLM error:", err)
    return serverError(c, "LLM generation failed: " + message)
  }
})

chats.post("/:id/regenerate", zValidator("json", ChatIdRequestSchema), async (c) => {
  const chatId = Number(c.req.param("id"))
  const body = c.req.valid("json")
  if (body.chat_id !== chatId) {
    return badRequest(c, "chat_id does not match path")
  }
  const chat = db.getChat(chatId)
  if (!chat) return notFound(c, "Chat not found")

  const members = db.listChatMembers(chatId)
  const aiMembers = listAiMembers(members)
  if (aiMembers.length === 0) return badRequest(c, "Chat has no AI members")

  const allMessages = db.listChatMessages(chatId)
  if (allMessages.length === 0) return badRequest(c, "Chat has no messages")

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

  if (!speakerMember) return serverError(c, "Failed to resolve speaker")

  const speakerState = parseMemberState(speakerMember.state_json)
  const speakerName = memberNameFromState(speakerState)
  const chatMembersForPrompt = buildChatMembersForPrompt(members)
  const stopTokens = buildChatStopTokens(chatMembersForPrompt.map((member) => member.state.name))
  const prompt = buildChatMessages(chat.scenario, chatMembersForPrompt, buildChatHistory(members, history), speakerName)

  try {
    const rawReply = await generateChatReply(prompt, stopTokens)
    const replyText = sanitizeChatReply(rawReply, speakerName)
    if (!replyText) return serverError(c, "LLM returned empty response")

    let aiMessageId: number
    let nextIndex = chat.next_speaker_index

    if (replaced) {
      db.updateChatMessage(lastMessage.id, replyText)
      aiMessageId = lastMessage.id
    } else {
      const aiMessageIndex = db.getNextChatMessageIndex(chatId)
      aiMessageId = db.appendChatMessage(chatId, aiMessageIndex, speakerMember.id, "assistant", replyText)
      const speakerIndex = aiMembers.findIndex((m) => m.id === speakerMember?.id)
      nextIndex = speakerIndex >= 0 ? (speakerIndex + 1) % aiMembers.length : chat.next_speaker_index
      db.advanceChatSpeaker(chatId, nextIndex)
    }

    db.clearCanceledChatExchange(chatId)

    const aiMessage = db.getChatMessage(aiMessageId)
    if (!aiMessage) return serverError(c, "Failed to persist chat message")

    return c.json({
      ai_message: buildMessagePayload(aiMessage, members),
      next_speaker_index: nextIndex,
      replaced,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error"
    if (message.includes("ECONNREFUSED") || message.includes("fetch failed")) {
      return c.json({ error: "KoboldCpp is not running. Please start KoboldCpp first." }, 503)
    }
    console.error("LLM error:", err)
    return serverError(c, "LLM generation failed: " + message)
  }
})

chats.post("/:id/cancel-last", zValidator("json", ChatIdRequestSchema), (c) => {
  const chatId = Number(c.req.param("id"))
  const body = c.req.valid("json")
  if (body.chat_id !== chatId) {
    return badRequest(c, "chat_id does not match path")
  }
  const chat = db.getChat(chatId)
  if (!chat) return notFound(c, "Chat not found")

  const members = db.listChatMembers(chatId)
  const aiMembers = listAiMembers(members)
  const messages = db.listChatMessages(chatId)
  if (messages.length === 0) return badRequest(c, "Chat has no messages")

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

  for (const msg of toRemove) {
    db.deleteChatMessage(msg.id)
  }

  let nextIndex = chat.next_speaker_index
  const lastAssistant = toRemove.find((m) => m.role === "assistant")
  if (lastAssistant && aiMembers.length > 0) {
    const assistantIndex = aiMembers.findIndex((m) => m.id === lastAssistant.speaker_member_id)
    if (assistantIndex >= 0) {
      nextIndex = assistantIndex
      db.updateChatNextSpeaker(chatId, nextIndex)
    }
  }

  db.setCanceledChatExchange(chatId, payload)

  return c.json({ removed_ids: removedIds, next_speaker_index: nextIndex })
})

chats.post("/:id/undo-cancel", zValidator("json", ChatIdRequestSchema), (c) => {
  const chatId = Number(c.req.param("id"))
  const body = c.req.valid("json")
  if (body.chat_id !== chatId) {
    return badRequest(c, "chat_id does not match path")
  }
  const chat = db.getChat(chatId)
  if (!chat) return notFound(c, "Chat not found")

  const payload = db.getCanceledChatExchange(chatId)
  if (!payload) return badRequest(c, "Nothing to undo")

  const members = db.listChatMembers(chatId)
  const inserted: db.ChatMessageRow[] = []
  const sorted = [...payload.messages].sort((a, b) => a.message_index - b.message_index)

  for (const msg of sorted) {
    const id = db.appendChatMessage(chatId, msg.message_index, msg.speaker_member_id, msg.role, msg.content)
    const restored = db.getChatMessage(id)
    if (restored) inserted.push(restored)
  }

  db.updateChatNextSpeaker(chatId, payload.next_speaker_index)
  db.clearCanceledChatExchange(chatId)

  return c.json({
    messages: inserted.map((m) => buildMessagePayload(m, members)),
    next_speaker_index: payload.next_speaker_index,
  })
})

chats.post("/:id/next-speaker", zValidator("json", SetNextChatSpeakerRequestSchema), (c) => {
  const chatId = Number(c.req.param("id"))
  const body = c.req.valid("json")
  if (body.chat_id !== chatId) {
    return badRequest(c, "chat_id does not match path")
  }
  const chat = db.getChat(chatId)
  if (!chat) return notFound(c, "Chat not found")

  const members = db.listChatMembers(chatId)
  const aiMembers = listAiMembers(members)
  const idx = aiMembers.findIndex((m) => m.id === body.speaker_member_id)
  if (idx < 0) return notFound(c, "Speaker not found")

  db.updateChatNextSpeaker(chatId, idx)
  return c.json({ next_speaker_index: idx })
})

export default chats
