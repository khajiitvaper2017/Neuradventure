import { Hono } from "hono"
import { zValidator } from "@hono/zod-validator"
import * as db from "../core/db.js"
import { CreateChatRequestSchema, SendChatMessageRequestSchema } from "../core/models.js"
import { getServerDefaults } from "../core/strings.js"
import { buildChatMessages, buildChatStopTokens, sanitizeChatReply } from "../llm/chat.js"
import { generateChatReply } from "../llm/index.js"

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
  if (!chat) return c.json({ error: "Chat not found" }, 404)
  const members = db.listChatMembers(id)
  return c.json({
    id: chat.id,
    title: chat.title,
    scenario: chat.scenario,
    speaker_strategy: chat.speaker_strategy,
    next_speaker_index: chat.next_speaker_index,
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
  if (!chat) return c.json({ error: "Chat not found" }, 404)
  const members = db.listChatMembers(id)
  const messages = db.listChatMessages(id)
  return c.json(messages.map((m) => buildMessagePayload(m, members)))
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
    return c.json({ error: "chat_id does not match path" }, 400)
  }
  const chat = db.getChat(chatId)
  if (!chat) return c.json({ error: "Chat not found" }, 404)

  const members = db.listChatMembers(chatId)
  const playerMember = members.find((m) => m.role === "player")
  if (!playerMember) return c.json({ error: "Chat has no player member" }, 400)

  const aiMembers = members.filter((m) => m.role === "ai").sort((a, b) => a.sort_order - b.sort_order)
  if (aiMembers.length === 0) return c.json({ error: "Chat has no AI members" }, 400)

  const trimmedContent = body.content.trim()
  if (!trimmedContent) return c.json({ error: "Message content is required" }, 400)

  const playerMessageIndex = db.getNextChatMessageIndex(chatId)
  const playerMessageId = db.appendChatMessage(chatId, playerMessageIndex, playerMember.id, "user", trimmedContent)

  const safeIndex = chat.next_speaker_index % aiMembers.length
  const nextSpeaker = aiMembers[safeIndex]
  const nextSpeakerState = parseMemberState(nextSpeaker.state_json)
  const nextSpeakerName = memberNameFromState(nextSpeakerState)

  const history = db.listChatMessages(chatId).map((m) => {
    const member = members.find((memberRow) => memberRow.id === m.speaker_member_id)
    const state = member ? parseMemberState(member.state_json) : null
    return {
      speakerName: memberNameFromState(state),
      content: m.content,
    }
  })

  const chatMembersForPrompt = members.map((member) => ({
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

  const stopTokens = buildChatStopTokens(chatMembersForPrompt.map((member) => member.state.name))
  const messages = buildChatMessages(chat.scenario, chatMembersForPrompt, history, nextSpeakerName)

  try {
    const rawReply = await generateChatReply(messages, stopTokens)
    const replyText = sanitizeChatReply(rawReply, nextSpeakerName)
    if (!replyText) return c.json({ error: "LLM returned empty response" }, 500)

    const aiMessageIndex = playerMessageIndex + 1
    const aiMessageId = db.appendChatMessage(chatId, aiMessageIndex, nextSpeaker.id, "assistant", replyText)

    const nextIndex = (safeIndex + 1) % aiMembers.length
    db.advanceChatSpeaker(chatId, nextIndex)

    const playerMessage = db.getChatMessage(playerMessageId)
    const aiMessage = db.getChatMessage(aiMessageId)

    if (!playerMessage || !aiMessage) {
      return c.json({ error: "Failed to persist chat messages" }, 500)
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
    return c.json({ error: "LLM generation failed: " + message }, 500)
  }
})

export default chats
