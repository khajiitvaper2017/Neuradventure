import { api } from "../api/client.js"
import { applyChatDetail, chatMessages } from "../stores/chat.js"

export async function loadChatById(id: number): Promise<void> {
  const [detail, messages] = await Promise.all([api.chats.get(id), api.chats.messages(id)])
  applyChatDetail(detail)
  chatMessages.set(messages)
}
