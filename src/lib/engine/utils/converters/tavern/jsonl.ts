import type { ChatMessageRow, ChatRow, TurnRow } from "@/engine/core/db"
import { getServerDefaults } from "@/engine/core/strings"

export interface STChatLine {
  user_name?: string
  character_name?: string
  create_date?: string
  name?: string
  is_user?: boolean
  send_date?: string
  mes?: string
}

export type ChatExportMessage = Pick<ChatMessageRow, "role" | "content" | "created_at"> & {
  speaker_name: string
}

export function storyToTavernJSONL(
  title: string,
  openingScenario: string,
  playerName: string,
  turns: TurnRow[],
): string {
  void title
  const lines: STChatLine[] = []
  const now = new Date().toISOString()

  // Header line
  lines.push({
    user_name: playerName,
    character_name: "Narrator",
    create_date: now,
  })

  // Opening scenario
  lines.push({
    name: "Narrator",
    is_user: false,
    send_date: now,
    mes: openingScenario,
  })

  for (const turn of turns) {
    // Player action
    lines.push({
      name: playerName,
      is_user: true,
      send_date: turn.created_at,
      mes: turn.player_input,
    })
    // Narrator response
    lines.push({
      name: "Narrator",
      is_user: false,
      send_date: turn.created_at,
      mes: turn.narrative_text,
    })
  }

  return lines.map((line) => JSON.stringify(line)).join("\n")
}

export function chatToTavernJSONL(
  chat: Pick<ChatRow, "title" | "created_at">,
  messages: ChatExportMessage[],
  playerName?: string,
) {
  const lines: STChatLine[] = []
  const createdAt = chat.created_at || new Date().toISOString()
  const safeTitle = chat.title?.trim() || "Group Chat"
  const resolvedPlayerName =
    playerName?.trim() || messages.find((m) => m.role === "user")?.speaker_name || getServerDefaults().unknown.value

  lines.push({
    user_name: resolvedPlayerName,
    character_name: safeTitle,
    create_date: createdAt,
  })

  for (const message of messages) {
    lines.push({
      name: message.speaker_name || getServerDefaults().unknown.value,
      is_user: message.role === "user",
      send_date: message.created_at,
      mes: message.content,
    })
  }

  return lines.map((line) => JSON.stringify(line)).join("\n")
}

export interface TavernChatImport {
  userName: string
  characterName: string
  openingScenario: string
  turns: Array<{ player_input: string; narrative_text: string }>
}

export function parseTavernJSONL(raw: string): TavernChatImport {
  const lines = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) throw new Error("Empty JSONL file")

  const parsed: STChatLine[] = lines.map((line, i) => {
    try {
      return JSON.parse(line) as STChatLine
    } catch {
      throw new Error(`Invalid JSON on line ${i + 1}`)
    }
  })

  let meta: STChatLine | null = null
  let messageLines = parsed
  if (parsed[0] && (parsed[0].user_name || parsed[0].character_name || parsed[0].create_date)) {
    meta = parsed[0]
    messageLines = parsed.slice(1)
    if (typeof meta.is_user === "boolean" || typeof meta.mes === "string") {
      messageLines = parsed
    }
  }

  const firstUser = messageLines.find((line) => line.is_user === true && typeof line.name === "string")
  const firstNarrator = messageLines.find((line) => line.is_user === false && typeof line.name === "string")

  const userName = meta?.user_name || firstUser?.name || "Player"
  const characterName = meta?.character_name || firstNarrator?.name || "Narrator"

  let openingScenario = ""
  const turns: Array<{ player_input: string; narrative_text: string }> = []
  let pendingUser: string | null = null
  let seenUser = false

  for (const line of messageLines) {
    const text = typeof line.mes === "string" ? line.mes.trim() : ""
    if (!text) continue

    if (line.is_user === true) {
      pendingUser = text
      seenUser = true
      continue
    }

    if (line.is_user === false) {
      if (!seenUser && !openingScenario) {
        openingScenario = text
        continue
      }
      if (pendingUser != null) {
        turns.push({ player_input: pendingUser, narrative_text: text })
        pendingUser = null
      } else if (!openingScenario) {
        openingScenario = text
      }
    }
  }

  return {
    userName,
    characterName,
    openingScenario,
    turns,
  }
}
