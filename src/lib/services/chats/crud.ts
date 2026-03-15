import { AppError } from "@/errors"
import * as db from "@/engine/core/db"
import type { ChatDetail, ChatMessage as ChatMessagePayload, ChatSummary } from "@/shared/types"
import type { ChatUpdateMessageResult, ChatUpdateResult } from "@/shared/api-types"
import { buildMessagePayload } from "@/services/chats/messages"
import { memberNameFromState, parseMemberState } from "@/services/chats/members"

export async function list(): Promise<ChatSummary[]> {
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
}

export async function get(id: number): Promise<ChatDetail> {
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
}

export async function messages(id: number): Promise<ChatMessagePayload[]> {
  const chat = db.getChat(id)
  if (!chat) throw new AppError(404, "Chat not found")
  const members = db.listChatMembers(id)
  const items = db.listChatMessages(id)
  return items.map((m) => buildMessagePayload(m, members))
}

export async function update(id: number, data: { title?: string }): Promise<ChatUpdateResult> {
  const chat = db.getChat(id)
  if (!chat) throw new AppError(404, "Chat not found")
  db.updateChat(id, { title: data.title?.trim() })
  return { ok: true }
}

export async function deleteChat(id: number): Promise<{ ok: boolean }> {
  const chat = db.getChat(id)
  if (!chat) throw new AppError(404, "Chat not found")
  db.deleteChat(id)
  return { ok: true }
}

export async function updateMessage(
  chatId: number,
  messageId: number,
  content: string,
): Promise<ChatUpdateMessageResult> {
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
}

export async function deleteMessage(chatId: number, messageId: number): Promise<{ ok: boolean }> {
  const message = db.getChatMessage(messageId)
  if (!message || message.chat_id !== chatId) throw new AppError(404, "Message not found")
  db.deleteChatMessage(messageId)
  db.clearCanceledChatExchange(chatId)
  return { ok: true }
}

export async function create(data: {
  title?: string
  members: Array<{
    role: "player" | "ai"
    member_kind: "character" | "npc"
    character_id?: number | null
    state: db.ChatMemberState
  }>
  seed_greeting?: { speaker_sort_order: number; content: string }
}): Promise<{ id: number }> {
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
}
