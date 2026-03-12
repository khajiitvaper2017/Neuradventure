import { callLLMText } from "./call.js"
import { buildImpersonateMessages } from "./context.js"
import { getGenerationParams } from "./client.js"
import type { MainCharacterState, NPCState, StoryModules, WorldState } from "../core/models.js"
import type { TurnRow } from "../core/db.js"

function sanitizePlayerAction(text: string): string {
  let value = text.trim()
  value = value.replace(/^===\s*PLAYER'S ACTION\s*===\s*/i, "")
  value = value.replace(/^Player action:\s*/i, "")
  const markerIndex = value.search(/\n\s*===\s+/)
  if (markerIndex >= 0) value = value.slice(0, markerIndex)
  return value.trim()
}

export async function generatePlayerAction(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  actionMode: string,
  initialCharacter?: MainCharacterState,
  ctxLimitOverride?: number,
  authorNote?: { text: string; depth: number } | null,
  storyModules?: StoryModules,
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
  const raw = await callLLMText(messages, maxTokens, { disableRepetition: true, stop: ["\n"] })
  return sanitizePlayerAction(raw)
}
