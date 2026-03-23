import { AppError } from "@/errors"
import * as db from "@/db/core"
import { LlmRole } from "@/types/roles"
import { getServerDefaults } from "@/utils/text/strings"
import { chatToPlaintext, chatToTavernJSONL } from "@/utils/converters/tavern"
import { memberNameFromState, resolveMemberState } from "@/services/chats/members"
import { downloadText } from "@/utils/downloadText"

export async function exportAndDownload(
  id: number,
  format: "neuradventure" | "tavern" | "plaintext" = "neuradventure",
): Promise<void> {
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
      message.role === LlmRole.System
        ? "System"
        : (memberNameById.get(message.speaker_member_id) ?? defaults.unknown.value)
    return {
      role: message.role,
      content: message.content,
      created_at: message.created_at,
      speaker_name: speakerName,
      speaker_member_id: message.speaker_member_id,
      message_index: message.message_index,
    }
  })

  const playerMember = members.find((member) => member.role === LlmRole.User)
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
}
