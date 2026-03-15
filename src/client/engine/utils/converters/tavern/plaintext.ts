import type { ChatRow, TurnRow } from "../../../core/db.js"
import type { ChatExportMessage } from "./jsonl.js"
import { getServerDefaults } from "../../../core/strings.js"

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
