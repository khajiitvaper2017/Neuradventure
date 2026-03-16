import { callLLMText } from "@/engine/llm/call"
import { buildImpersonateMessages } from "@/engine/llm/context"
import { getGenerationParams } from "@/engine/llm/client"
import type { MainCharacterState, NPCState, StoryModules, WorldState } from "@/engine/core/models"
import type { TurnRow } from "@/engine/core/db"

function sanitizePlayerAction(text: string): string {
  let value = text.trim()
  value = value.replace(/^===\s*PLAYER'S ACTION\s*===\s*/i, "")
  value = value.replace(/^Player action:\s*/i, "")
  const markerIndex = value.search(/\n\s*===\s+/)
  if (markerIndex >= 0) value = value.slice(0, markerIndex)
  value = value.trim()

  const lines = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0)
  return (lines[0] ?? "").trim()
}

export async function generatePlayerAction(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  actionMode: string,
  initialCharacter?: MainCharacterState,
  ctxLimitOverride?: number,
  authorNote?: {
    text: string
    depth: number
    position: number
    interval: number
    role: number
    embedState: boolean
    enabled: boolean
  } | null,
  storyModules?: StoryModules,
  options: { onText?: (text: string) => void } = {},
): Promise<string> {
  const messages = buildImpersonateMessages(
    character,
    world,
    npcs,
    recentTurns,
    actionMode,
    initialCharacter,
    ctxLimitOverride,
    authorNote,
    storyModules,
  )
  const maxTokens = Math.min(getGenerationParams().max_tokens, 160)
  const raw = await callLLMText(messages, maxTokens, {
    disableRepetition: true,
    requestName: "PlayerAction",
    ...(options.onText ? { onText: options.onText } : {}),
  })
  return sanitizePlayerAction(raw)
}
