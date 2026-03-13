import { writable } from "svelte/store"
import type { ChatDetail, ChatMessage, ChatMember } from "../api/client.js"

export const currentChatId = writable<number | null>(null)
export const currentChatTitle = writable<string>("")
export const chatMembers = writable<ChatMember[]>([])
export const chatMessages = writable<ChatMessage[]>([])
export const nextSpeakerIndex = writable<number>(0)
export const isChatGenerating = writable(false)
export const canUndoChatCancel = writable(false)

export function resetChat() {
  currentChatId.set(null)
  currentChatTitle.set("")
  chatMembers.set([])
  chatMessages.set([])
  nextSpeakerIndex.set(0)
  isChatGenerating.set(false)
  canUndoChatCancel.set(false)
}

export function applyChatDetail(detail: ChatDetail) {
  currentChatId.set(detail.id)
  currentChatTitle.set(detail.title)
  chatMembers.set(detail.members)
  nextSpeakerIndex.set(detail.next_speaker_index ?? 0)
  canUndoChatCancel.set(detail.can_undo_cancel ?? false)
}
