import * as db from "@/db/core"
import type { ChatMessage } from "@/llm/chat"
import type { ChatMessage as ChatMessagePayload } from "@/types/types"
import { LlmRole } from "@/types/roles"
import { memberNameFromState, parseMemberState } from "@/services/chats/members"

export function buildMessagePayload(message: db.ChatMessageRow, members: db.ChatMemberRow[]): ChatMessagePayload {
  if (message.role === LlmRole.System) {
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

export function buildChatHistory(members: db.ChatMemberRow[], messages: db.ChatMessageRow[]): ChatMessage[] {
  return messages.map((m) => {
    if (m.role === LlmRole.System) return { speakerName: "System", content: m.content }
    const member = members.find((memberRow) => memberRow.id === m.speaker_member_id)
    const state = member ? parseMemberState(member.state_json) : null
    return {
      speakerName: memberNameFromState(state),
      content: m.content,
    }
  })
}
