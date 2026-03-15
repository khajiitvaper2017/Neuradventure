import type { ChatDetail, ChatMessage as ChatMessagePayload, ChatSummary } from "@/shared/types"
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
import { create, deleteChat, deleteMessage, get, list, messages, update, updateMessage } from "@/services/chats/crud"
import { exportAndDownload } from "@/services/chats/export"
import { cancelLast, continueChat, regenerateLast, send, setNextSpeaker, undoCancel } from "@/services/chats/generation"

export const chats = {
  list,
  get,
  messages,
  update,
  delete: deleteChat,
  exportAndDownload,
  updateMessage,
  deleteMessage,
  create,
  send,
  continue: continueChat,
  regenerateLast,
  cancelLast,
  undoCancel,
  setNextSpeaker,
} satisfies {
  list: () => Promise<ChatSummary[]>
  get: (id: number) => Promise<ChatDetail>
  messages: (id: number) => Promise<ChatMessagePayload[]>
  update: (id: number, data: { title?: string }) => Promise<ChatUpdateResult>
  delete: (id: number) => Promise<{ ok: boolean }>
  exportAndDownload: (id: number, format?: "neuradventure" | "tavern" | "plaintext") => Promise<void>
  updateMessage: (chatId: number, messageId: number, content: string) => Promise<ChatUpdateMessageResult>
  deleteMessage: (chatId: number, messageId: number) => Promise<{ ok: boolean }>
  create: (data: {
    title?: string
    members: Array<{
      role: "player" | "ai"
      member_kind: "character" | "npc"
      character_id?: number | null
      state: unknown
    }>
    seed_greeting?: { speaker_sort_order: number; content: string }
  }) => Promise<{ id: number }>
  send: (id: number, content: string, requestId?: string) => Promise<ChatSendResult>
  continue: (id: number, requestId?: string) => Promise<ChatContinueResult>
  regenerateLast: (id: number, requestId?: string) => Promise<ChatRegenerateResult>
  cancelLast: (id: number) => Promise<ChatCancelResult>
  undoCancel: (id: number) => Promise<ChatUndoCancelResult>
  setNextSpeaker: (id: number, speakerMemberId: number) => Promise<ChatSetNextSpeakerResult>
}
