import type { MainCharacterState, NPCState } from "@/types/types"
import { getDb } from "@/db/connection"
import type { ConversationRole } from "@/types/roles"
import { LlmRole } from "@/types/roles"

export type ChatMemberState = Omit<MainCharacterState, "inventory"> | Omit<NPCState, "inventory">

export interface ChatRow {
  id: number
  title: string
  scenario: string
  speaker_strategy: string
  next_speaker_index: number
  created_at: string
  updated_at: string
}

export interface ChatMemberRow {
  id: number
  chat_id: number
  role: ConversationRole
  member_kind: "character" | "npc"
  character_id: number | null
  state_json: string
  sort_order: number
  created_at: string
}

export interface ChatMessageRow {
  id: number
  chat_id: number
  message_index: number
  speaker_member_id: number
  role: LlmRole
  content: string
  created_at: string
}

export interface ChatMemberInput {
  role: ConversationRole
  member_kind: "character" | "npc"
  character_id: number | null
  state: ChatMemberState
  sort_order: number
}

export type CanceledChatExchangePayload = {
  messages: Array<{
    message_index: number
    speaker_member_id: number
    role: LlmRole
    content: string
  }>
  next_speaker_index: number
}

export function createChat(
  title: string,
  speaker_strategy: string,
  next_speaker_index: number,
  members: ChatMemberInput[],
): number {
  const database = getDb()
  const insertChat = database.prepare(
    `INSERT INTO chats (title, speaker_strategy, next_speaker_index)
     VALUES (?, ?, ?)`,
  )
  const insertMember = database.prepare(
    `INSERT INTO chat_members (chat_id, role, member_kind, character_id, state_json, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  )
  const tx = database.transaction(() => {
    const result = insertChat.run(title, speaker_strategy, next_speaker_index)
    const chatId = result.lastInsertRowid as number
    for (const member of members) {
      insertMember.run(
        chatId,
        member.role,
        member.member_kind,
        member.character_id,
        JSON.stringify(member.state),
        member.sort_order,
      )
    }
    return chatId
  })
  return tx()
}

export function listChats(): (ChatRow & { message_count: number })[] {
  return getDb()
    .prepare(
      `SELECT c.*, COUNT(m.id) as message_count
       FROM chats c
       LEFT JOIN chat_messages m ON m.chat_id = c.id
       GROUP BY c.id
       ORDER BY c.updated_at DESC`,
    )
    .all() as (ChatRow & { message_count: number })[]
}

export function getChat(id: number): ChatRow | undefined {
  return getDb().prepare("SELECT * FROM chats WHERE id = ?").get(id) as ChatRow | undefined
}

export function updateChat(id: number, data: { title?: string }): void {
  const nextTitle = data.title ?? null
  getDb()
    .prepare(
      `UPDATE chats
       SET title = COALESCE(?, title),
           updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(nextTitle, id)
}

export function deleteChat(id: number): void {
  getDb().prepare("DELETE FROM chats WHERE id = ?").run(id)
}

export function listChatMembers(chat_id: number): ChatMemberRow[] {
  return getDb()
    .prepare("SELECT * FROM chat_members WHERE chat_id = ? ORDER BY sort_order ASC, id ASC")
    .all(chat_id) as ChatMemberRow[]
}

export function listChatMessages(chat_id: number): ChatMessageRow[] {
  return getDb()
    .prepare("SELECT * FROM chat_messages WHERE chat_id = ? ORDER BY message_index ASC")
    .all(chat_id) as ChatMessageRow[]
}

export function getChatMessage(id: number): ChatMessageRow | undefined {
  return getDb().prepare("SELECT * FROM chat_messages WHERE id = ?").get(id) as ChatMessageRow | undefined
}

export function updateChatMessage(id: number, content: string): void {
  getDb().prepare("UPDATE chat_messages SET content = ? WHERE id = ?").run(content, id)
  getDb()
    .prepare(
      "UPDATE chats SET updated_at = datetime('now') WHERE id = (SELECT chat_id FROM chat_messages WHERE id = ?)",
    )
    .run(id)
}

export function deleteChatMessage(id: number): void {
  const row = getDb().prepare("SELECT chat_id FROM chat_messages WHERE id = ?").get(id) as
    | { chat_id: number }
    | undefined
  getDb().prepare("DELETE FROM chat_messages WHERE id = ?").run(id)
  if (row) {
    getDb().prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(row.chat_id)
  }
}

export function updateChatNextSpeaker(chat_id: number, next_speaker_index: number): void {
  getDb()
    .prepare("UPDATE chats SET next_speaker_index = ?, updated_at = datetime('now') WHERE id = ?")
    .run(next_speaker_index, chat_id)
}

export function getNextChatMessageIndex(chat_id: number): number {
  const result = getDb()
    .prepare("SELECT COALESCE(MAX(message_index), 0) + 1 as next FROM chat_messages WHERE chat_id = ?")
    .get(chat_id) as { next: number }
  return result.next
}

export function appendChatMessage(
  chat_id: number,
  message_index: number,
  speaker_member_id: number,
  role: LlmRole,
  content: string,
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO chat_messages (chat_id, message_index, speaker_member_id, role, content)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .run(chat_id, message_index, speaker_member_id, role, content)
  getDb().prepare("UPDATE chats SET updated_at = datetime('now') WHERE id = ?").run(chat_id)
  return result.lastInsertRowid as number
}

export function advanceChatSpeaker(chat_id: number, next_speaker_index: number): void {
  getDb()
    .prepare("UPDATE chats SET next_speaker_index = ?, updated_at = datetime('now') WHERE id = ?")
    .run(next_speaker_index, chat_id)
}

export function setCanceledChatExchange(chat_id: number, payload: CanceledChatExchangePayload): void {
  getDb()
    .prepare(
      `INSERT INTO canceled_chat_exchanges (chat_id, payload_json, canceled_at)
       VALUES (?, ?, datetime('now'))
       ON CONFLICT(chat_id) DO UPDATE SET payload_json = excluded.payload_json, canceled_at = datetime('now')`,
    )
    .run(chat_id, JSON.stringify(payload))
}

export function getCanceledChatExchange(chat_id: number): CanceledChatExchangePayload | undefined {
  const row = getDb().prepare("SELECT payload_json FROM canceled_chat_exchanges WHERE chat_id = ?").get(chat_id) as
    | { payload_json: string }
    | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.payload_json) as CanceledChatExchangePayload
  } catch {
    return undefined
  }
}

export function clearCanceledChatExchange(chat_id: number): void {
  getDb().prepare("DELETE FROM canceled_chat_exchanges WHERE chat_id = ?").run(chat_id)
}
