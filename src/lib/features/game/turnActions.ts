import type { TurnVariantSummary } from "@/shared/types"
import { turns as turnsService } from "@/services/turns"
import { applyTurnState, appendTurnSummary } from "@/features/game/actions"
import { turns } from "@/stores/game"
import { get } from "svelte/store"

export type ActionMode = "do" | "say" | "story"

export type TakeTurnInput = {
  storyId: number
  playerInput: string
  actionMode: ActionMode
  requestId: string
}

export type TakeTurnResult = {
  turnId: number
  llmWarnings?: string[]
}

export function formatLlmWarningsNotice(warnings?: string[]): string | null {
  if (!warnings || warnings.length === 0) return null
  const count = warnings.length
  return `LLM repeated ${count} unchanged ${count === 1 ? "value" : "values"}.`
}

function logLlmWarnings(warnings?: string[]) {
  if (!warnings || warnings.length === 0) return
  console.warn("[llm] Repeated values from previous state:", warnings)
}

export async function takeTurn(input: TakeTurnInput): Promise<TakeTurnResult> {
  const result = await turnsService.take(input.storyId, input.playerInput, input.actionMode, input.requestId)
  logLlmWarnings(result.llm_warnings)
  applyTurnState(result)
  appendTurnSummary({ result, actionMode: input.actionMode, playerInput: input.playerInput })
  return { turnId: result.turn_id, llmWarnings: result.llm_warnings }
}

export type ResumePendingTurnInput = {
  storyId: number
  actionMode: ActionMode
  playerInput: string
  requestId: string
}

export async function resumePendingTurn(
  input: ResumePendingTurnInput,
): Promise<{ turnId: number; llmWarnings?: string[] }> {
  const result = await turnsService.take(input.storyId, input.playerInput, input.actionMode, input.requestId)
  logLlmWarnings(result.llm_warnings)
  applyTurnState(result)
  const exists = get(turns).some((t) => t.id === result.turn_id)
  if (!exists) {
    appendTurnSummary({
      result,
      actionMode: input.actionMode,
      playerInput: input.playerInput,
      activeVariantId: null,
    })
  }
  return { turnId: result.turn_id, llmWarnings: result.llm_warnings }
}

export async function regenerateLastTurn(input: {
  storyId: number
  mode: ActionMode
  requestId: string
}): Promise<{ turnId: number; llmWarnings?: string[] }> {
  const result = await turnsService.regenerateLast(input.storyId, input.mode, input.requestId)
  logLlmWarnings(result.llm_warnings)
  applyTurnState(result)
  turns.update((list) =>
    list.map((turn) =>
      turn.id === result.turn_id
        ? {
            ...turn,
            narrative_text: result.narrative_text,
            background_events: result.background_events,
            action_mode: input.mode,
            world: result.world,
          }
        : turn,
    ),
  )
  return { turnId: result.turn_id, llmWarnings: result.llm_warnings }
}

export type CancelLastTurnResult = {
  nextLastId: number | null
}

export async function cancelLastTurn(storyId: number): Promise<CancelLastTurnResult> {
  const result = await turnsService.cancelLast(storyId)
  applyTurnState(result, { markUpdate: false })

  let nextLastId: number | null = null
  turns.update((t) => {
    const remaining = t.filter((turn) => turn.id !== result.removed_turn_id)
    nextLastId = remaining[remaining.length - 1]?.id ?? null
    return remaining
  })

  return {
    nextLastId,
  }
}

export async function undoCancelLastTurn(storyId: number): Promise<{ turnId: number }> {
  const result = await turnsService.undoCancel(storyId)
  applyTurnState(result)
  appendTurnSummary({
    result,
    actionMode: result.action_mode,
    playerInput: result.player_input,
    activeVariantId: result.active_variant_id,
  })
  return { turnId: result.turn_id }
}

export async function selectVariant(input: {
  turnId: number
  variantId: number
}): Promise<{ activeVariantId: number | null }> {
  const result = await turnsService.selectVariant(input.turnId, input.variantId)
  applyTurnState(result)
  turns.update((t) =>
    t.map((turn) =>
      turn.id === result.turn_id
        ? {
            ...turn,
            narrative_text: result.narrative_text,
            background_events: result.background_events,
            active_variant_id: result.active_variant_id,
            world: result.world,
          }
        : turn,
    ),
  )
  return { activeVariantId: result.active_variant_id }
}

export async function fetchVariants(
  turnId: number,
): Promise<{ variants: TurnVariantSummary[]; activeVariantId: number | null }> {
  const res = await turnsService.variants(turnId)
  return { variants: res.variants, activeVariantId: res.active_variant_id }
}
