import type { ChatRow, TurnRow } from "@/engine/core/db"
import type { ChatExportMessage } from "@/engine/utils/converters/tavern/jsonl"
import { getServerDefaults } from "@/engine/core/strings"

export function storyToPlaintext(title: string, openingScenario: string, turns: TurnRow[]): string {
  const parts: string[] = [`# ${title}`, "", openingScenario]

  for (const turn of turns) {
    parts.push("")
    parts.push(`> ${turn.player_input}`)
    parts.push("")
    parts.push(turn.narrative_text)
  }

  return parts.join("\n")
}

export function chatToPlaintext(chat: Pick<ChatRow, "title">, messages: ChatExportMessage[]): string {
  const safeTitle = chat.title?.trim() || "Chat"
  const parts: string[] = [`# ${safeTitle}`]

  for (const message of messages) {
    parts.push("")
    parts.push(`${message.speaker_name || getServerDefaults().unknown.value}:`)
    parts.push(message.content)
  }

  return parts.join("\n")
}
