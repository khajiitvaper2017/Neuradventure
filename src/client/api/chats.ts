import { request } from "./http.js"
import type { ChatDetail, ChatMessage, ChatSummary, MainCharacterState, NPCState } from "../../../shared/types.js"
import type {
  ChatCancelResult,
  ChatContinueResult,
  ChatRegenerateResult,
  ChatSendResult,
  ChatSetNextSpeakerResult,
  ChatUndoCancelResult,
  ChatUpdateMessageResult,
  ChatUpdateResult,
} from "./types.js"

export const chats = {
  list: () => request<ChatSummary[]>("/api/chats"),
  get: (id: number) => request<ChatDetail>(`/api/chats/${id}`),
  messages: (id: number) => request<ChatMessage[]>(`/api/chats/${id}/messages`),
  update: (id: number, data: { title?: string }) =>
    request<ChatUpdateResult>(`/api/chats/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  delete: (id: number) => request<{ ok: boolean }>(`/api/chats/${id}`, { method: "DELETE" }),
  exportUrl: (id: number, format?: "neuradventure" | "tavern" | "plaintext") =>
    `/api/chats/${id}/export${format ? `?format=${format}` : ""}`,
  updateMessage: (chatId: number, messageId: number, content: string) =>
    request<ChatUpdateMessageResult>(`/api/chats/${chatId}/messages/${messageId}`, {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  deleteMessage: (chatId: number, messageId: number) =>
    request<{ ok: boolean }>(`/api/chats/${chatId}/messages/${messageId}`, { method: "DELETE" }),
  create: (data: {
    title?: string
    members: Array<{
      role: "player" | "ai"
      member_kind: "character" | "npc"
      character_id?: number | null
      state: Omit<MainCharacterState, "inventory"> | Omit<NPCState, "inventory">
    }>
    seed_greeting?: {
      speaker_sort_order: number
      content: string
    }
  }) => request<{ id: number }>("/api/chats", { method: "POST", body: JSON.stringify(data) }),
  send: (id: number, content: string) =>
    request<ChatSendResult>(`/api/chats/${id}/messages`, {
      method: "POST",
      body: JSON.stringify({ chat_id: id, content }),
    }),
  continue: (id: number) =>
    request<ChatContinueResult>(`/api/chats/${id}/continue`, {
      method: "POST",
      body: JSON.stringify({ chat_id: id }),
    }),
  regenerateLast: (id: number) =>
    request<ChatRegenerateResult>(`/api/chats/${id}/regenerate`, {
      method: "POST",
      body: JSON.stringify({ chat_id: id }),
    }),
  cancelLast: (id: number) =>
    request<ChatCancelResult>(`/api/chats/${id}/cancel-last`, {
      method: "POST",
      body: JSON.stringify({ chat_id: id }),
    }),
  undoCancel: (id: number) =>
    request<ChatUndoCancelResult>(`/api/chats/${id}/undo-cancel`, {
      method: "POST",
      body: JSON.stringify({ chat_id: id }),
    }),
  setNextSpeaker: (id: number, speakerMemberId: number) =>
    request<ChatSetNextSpeakerResult>(`/api/chats/${id}/next-speaker`, {
      method: "POST",
      body: JSON.stringify({ chat_id: id, speaker_member_id: speakerMemberId }),
    }),
}
