import { chats } from "@/services/chats"
import { applyChatDetail, chatMessages } from "@/stores/chat"

export async function loadChatById(id: number): Promise<void> {
  const [detail, messages] = await Promise.all([chats.get(id), chats.messages(id)])
  applyChatDetail(detail)
  chatMessages.set(messages)
}
