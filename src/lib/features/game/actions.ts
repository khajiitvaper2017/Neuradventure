import type { MainCharacterState, NPCState, TurnSummary, WorldState } from "@/types/types"
import { character, worldState, npcs, turns, markLlmUpdate } from "@/stores/game"

type TurnStatePayload = {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

type TurnAppendPayload = TurnStatePayload & {
  turn_id: number
  turn_number: number
  narrative_text: string
  background_events: string | null
}

type ActionMode = TurnSummary["action_mode"]

export function applyTurnState(result: TurnStatePayload, options: { markUpdate?: boolean } = {}) {
  character.set(result.character)
  worldState.set(result.world)
  npcs.set(result.npcs)
  if (options.markUpdate !== false) markLlmUpdate()
}

export function appendTurnSummary(params: {
  result: TurnAppendPayload
  actionMode: ActionMode
  playerInput: string
  activeVariantId?: number | null
}) {
  const { result, actionMode, playerInput, activeVariantId } = params
  const newTurn: TurnSummary = {
    id: result.turn_id,
    turn_number: result.turn_number,
    action_mode: actionMode,
    player_input: playerInput,
    narrative_text: result.narrative_text,
    background_events: result.background_events,
    world: result.world,
    created_at: new Date().toISOString(),
  }
  if (activeVariantId !== undefined) newTurn.active_variant_id = activeVariantId
  turns.update((t) => [...t, newTurn])
  return newTurn
}
