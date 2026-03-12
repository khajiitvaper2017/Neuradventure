import { api } from "../../api/client.js"
import type { ChatMessage } from "../../api/client.js"
import { chatMessages, nextSpeakerIndex, canUndoChatCancel } from "../../stores/chat.js"

type SendResult = {
  player_message: ChatMessage
  ai_message: ChatMessage
  next_speaker_index: number
}

type ContinueResult = {
  ai_message: ChatMessage
  next_speaker_index: number
}

type RegenerateResult = {
  ai_message: ChatMessage
  next_speaker_index: number
  replaced: boolean
}

type CancelResult = {
  removed_ids: number[]
  next_speaker_index: number
}

type UndoResult = {
  messages: ChatMessage[]
  next_speaker_index: number
}

export function appendChatExchange(result: SendResult) {
  chatMessages.update((list) => [...list, result.player_message, result.ai_message])
  nextSpeakerIndex.set(result.next_speaker_index)
  canUndoChatCancel.set(false)
}

export function appendChatMessage(result: ContinueResult) {
  chatMessages.update((list) => [...list, result.ai_message])
  nextSpeakerIndex.set(result.next_speaker_index)
  canUndoChatCancel.set(false)
}

export function applyRegenerateResult(result: RegenerateResult) {
  if (result.replaced) {
    chatMessages.update((list) => list.map((m) => (m.id === result.ai_message.id ? result.ai_message : m)))
  } else {
    chatMessages.update((list) => [...list, result.ai_message])
  }
  nextSpeakerIndex.set(result.next_speaker_index)
  canUndoChatCancel.set(false)
}

export function applyCancelResult(result: CancelResult) {
  chatMessages.update((list) => list.filter((m) => !result.removed_ids.includes(m.id)))
  nextSpeakerIndex.set(result.next_speaker_index)
  canUndoChatCancel.set(true)
}

export function applyUndoCancelResult(result: UndoResult) {
  chatMessages.update((list) => [...list, ...result.messages].sort((a, b) => a.message_index - b.message_index))
  nextSpeakerIndex.set(result.next_speaker_index)
  canUndoChatCancel.set(false)
}

export async function generateChatFromDescription(prompt: string) {
  return api.generate.chat(prompt)
}
