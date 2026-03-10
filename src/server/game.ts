import {
  MainCharacterStateSchema,
  NPCStateSchema,
  WorldStateSchema,
  type MainCharacterState,
  type NPCState,
  type TurnResponse,
  type WorldState,
} from "./models.js"
import * as db from "./db.js"
import { buildTurnMessages, callLLM, getCtxLimitCached } from "./llm.js"

// ─── State Application ─────────────────────────────────────────────────────────

function applyPlayerUpdate(
  character: MainCharacterState,
  update: TurnResponse["player_state_update"],
): MainCharacterState {
  const updated = { ...character, appearance: { ...character.appearance } }

  if (update.appearance_update) {
    updated.appearance = { ...updated.appearance, physical_description: update.appearance_update }
  }
  if (update.clothing_update) {
    updated.appearance = { ...updated.appearance, current_clothing: update.clothing_update }
  }
  if (update.inventory_update !== undefined) {
    updated.inventory = update.inventory_update
  }

  return updated
}

function applyNPCUpdates(npcs: NPCState[], updates: TurnResponse["npc_updates"], newNPCs: NPCState[]): NPCState[] {
  const updated = npcs.map((npc) => {
    const patch = updates.find((u) => u.name.toLowerCase() === npc.name.toLowerCase())
    if (!patch) return npc

    return {
      ...npc,
      last_known_location: patch.last_known_location ?? npc.last_known_location,
      appearance: {
        physical_description: patch.appearance_update ?? npc.appearance.physical_description,
        current_clothing: patch.clothing_update ?? npc.appearance.current_clothing,
      },
      relationship_to_player: patch.relationship_change ?? npc.relationship_to_player,
      notes: patch.notes_update ?? npc.notes,
    }
  })

  return [...updated, ...newNPCs]
}

// ─── Core Game Operations ──────────────────────────────────────────────────────

export interface TurnResult {
  turn_id: number
  story_id: number
  turn_number: number
  narrative_text: string
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

export async function processTurn(
  storyId: number,
  playerInput: string,
  actionMode: string,
  requestId?: string,
): Promise<TurnResult> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const character = MainCharacterStateSchema.parse(JSON.parse(story.character_state_json))
  const world = WorldStateSchema.parse(JSON.parse(story.world_state_json))
  const npcs = (JSON.parse(story.npc_states_json) as unknown[]).map((n) => NPCStateSchema.parse(n))
  const initial = parseInitialStorySnapshot(story).character
  const recentTurns = db.getTurnsForStory(storyId)
  const ctxLimit = getCtxLimitCached()

  const messages = buildTurnMessages(character, world, npcs, recentTurns, playerInput, actionMode, initial, ctxLimit)
  const turnResponse = await callLLM(messages)

  const newCharacter = applyPlayerUpdate(character, turnResponse.player_state_update)
  const newWorld = turnResponse.world_state_update
  const newNpcs = applyNPCUpdates(npcs, turnResponse.npc_updates, turnResponse.new_npcs)

  db.updateStory(storyId, newCharacter, newWorld, newNpcs)

  const turnNumber = db.getNextTurnNumber(storyId)
  const turnId = db.createTurn(
    storyId,
    turnNumber,
    actionMode,
    requestId ?? null,
    playerInput,
    turnResponse.narrative_text,
    newCharacter,
    newWorld,
    newNpcs,
  )
  const variant = db.createTurnVariant(turnId, turnResponse.narrative_text, newCharacter, newWorld, newNpcs)
  db.setActiveTurnVariant(turnId, variant.id)

  return {
    turn_id: turnId,
    story_id: storyId,
    turn_number: turnNumber,
    narrative_text: turnResponse.narrative_text,
    character: newCharacter,
    world: newWorld,
    npcs: newNpcs,
  }
}

function parseTurnSnapshot(turn: db.TurnRow): { character: MainCharacterState; world: WorldState; npcs: NPCState[] } {
  const character = MainCharacterStateSchema.parse(JSON.parse(turn.character_snapshot_json))
  const world = WorldStateSchema.parse(JSON.parse(turn.world_snapshot_json))
  const npcs = (JSON.parse(turn.npc_snapshot_json) as unknown[]).map((n) => NPCStateSchema.parse(n))
  return { character, world, npcs }
}

export function buildTurnResultFromRow(turn: db.TurnRow): TurnResult {
  const snapshot = parseTurnSnapshot(turn)
  return {
    turn_id: turn.id,
    story_id: turn.story_id,
    turn_number: turn.turn_number,
    narrative_text: turn.narrative_text,
    character: snapshot.character,
    world: snapshot.world,
    npcs: snapshot.npcs,
  }
}

function parseTurnVariantSnapshot(variant: db.TurnVariantRow): {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
} {
  const character = MainCharacterStateSchema.parse(JSON.parse(variant.character_snapshot_json))
  const world = WorldStateSchema.parse(JSON.parse(variant.world_snapshot_json))
  const npcs = (JSON.parse(variant.npc_snapshot_json) as unknown[]).map((n) => NPCStateSchema.parse(n))
  return { character, world, npcs }
}

function parseInitialStorySnapshot(story: db.StoryRow): {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
} {
  const characterJson = story.initial_character_state_json ?? story.character_state_json
  const worldJson = story.initial_world_state_json ?? story.world_state_json
  const npcsJson = story.initial_npc_states_json ?? story.npc_states_json
  const character = MainCharacterStateSchema.parse(JSON.parse(characterJson))
  const world = WorldStateSchema.parse(JSON.parse(worldJson))
  const npcs = (JSON.parse(npcsJson) as unknown[]).map((n) => NPCStateSchema.parse(n))
  return { character, world, npcs }
}

export interface CancelLastResult {
  removed_turn_id: number
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

export interface UndoCancelResult {
  turn_id: number
  story_id: number
  turn_number: number
  action_mode: string
  player_input: string
  narrative_text: string
  active_variant_id: number | null
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

export function cancelLastTurn(storyId: number): CancelLastResult {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const turnRows = db.getTurnsForStory(storyId)
  const lastTurn = turnRows[turnRows.length - 1]
  if (!lastTurn) throw new Error("No turns to cancel")

  const lastSnapshot = parseTurnSnapshot(lastTurn)
  const variants = db.listTurnVariants(lastTurn.id)
  const activeVariant =
    lastTurn.active_variant_id !== null
      ? variants.find((variant) => variant.id === lastTurn.active_variant_id) ?? null
      : null
  const activeVariantIndex =
    activeVariant?.variant_index ?? (variants.length > 0 ? variants[variants.length - 1].variant_index : null)
  const variantPayloads = variants.map((variant) => {
    const snapshot = parseTurnVariantSnapshot(variant)
    return {
      variant_index: variant.variant_index,
      narrative_text: variant.narrative_text,
      character: snapshot.character,
      world: snapshot.world,
      npcs: snapshot.npcs,
    }
  })
  db.saveCanceledTurn(storyId, {
    turn_number: lastTurn.turn_number,
    action_mode: lastTurn.action_mode,
    active_variant_index: activeVariantIndex,
    player_input: lastTurn.player_input,
    narrative_text: lastTurn.narrative_text,
    character: lastSnapshot.character,
    world: lastSnapshot.world,
    npcs: lastSnapshot.npcs,
    variants: variantPayloads,
  })

  const previousTurn = turnRows.length > 1 ? turnRows[turnRows.length - 2] : null
  const snapshot = previousTurn ? parseTurnSnapshot(previousTurn) : parseInitialStorySnapshot(story)

  db.updateStory(storyId, snapshot.character, snapshot.world, snapshot.npcs)
  db.deleteTurn(lastTurn.id)

  return {
    removed_turn_id: lastTurn.id,
    character: snapshot.character,
    world: snapshot.world,
    npcs: snapshot.npcs,
  }
}

export function undoCancelLastTurn(storyId: number): UndoCancelResult {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const canceled = db.getCanceledTurn(storyId)
  if (!canceled) throw new Error("No canceled turn to restore")

  const currentLast = db.getLastTurnForStory(storyId)
  const expectedPrev = canceled.turn_number - 1
  if (currentLast) {
    if (currentLast.turn_number !== expectedPrev) {
      throw new Error("Cannot undo cancel after new turns were added")
    }
  } else if (canceled.turn_number !== 1) {
    throw new Error("Cannot undo cancel after new turns were added")
  }

  const turnId = db.createTurn(
    storyId,
    canceled.turn_number,
    canceled.action_mode,
    null,
    canceled.player_input,
    canceled.narrative_text,
    canceled.character,
    canceled.world,
    canceled.npcs,
  )

  let activeVariantId: number | null = null
  let lastVariantId: number | null = null
  const sortedVariants = [...canceled.variants].sort((a, b) => a.variant_index - b.variant_index)
  for (const variant of sortedVariants) {
    const created = db.createTurnVariant(turnId, variant.narrative_text, variant.character, variant.world, variant.npcs)
    lastVariantId = created.id
    if (canceled.active_variant_index !== null && variant.variant_index === canceled.active_variant_index) {
      activeVariantId = created.id
    }
  }

  if (activeVariantId === null && lastVariantId !== null) {
    activeVariantId = lastVariantId
  }
  if (activeVariantId !== null) {
    db.setActiveTurnVariant(turnId, activeVariantId)
  }

  db.updateStory(storyId, canceled.character, canceled.world, canceled.npcs)
  db.clearCanceledTurn(storyId)

  return {
    turn_id: turnId,
    story_id: storyId,
    turn_number: canceled.turn_number,
    action_mode: canceled.action_mode,
    player_input: canceled.player_input,
    narrative_text: canceled.narrative_text,
    active_variant_id: activeVariantId,
    character: canceled.character,
    world: canceled.world,
    npcs: canceled.npcs,
  }
}

export async function regenerateLastTurn(storyId: number, actionMode?: string): Promise<TurnResult> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const turnRows = db.getTurnsForStory(storyId)
  const lastTurn = turnRows[turnRows.length - 1]
  if (!lastTurn) throw new Error("No turns to regenerate")

  const initial = parseInitialStorySnapshot(story).character
  const ctxLimit = getCtxLimitCached()
  const historyTurns = turnRows.slice(0, -1)
  const snapshot =
    historyTurns.length > 0
      ? parseTurnSnapshot(historyTurns[historyTurns.length - 1])
      : parseInitialStorySnapshot(story)
  const mode = actionMode ?? lastTurn.action_mode ?? "do"

  const messages = buildTurnMessages(
    snapshot.character,
    snapshot.world,
    snapshot.npcs,
    historyTurns,
    lastTurn.player_input,
    mode,
    initial,
    ctxLimit,
  )
  const turnResponse = await callLLM(messages)

  const newCharacter = applyPlayerUpdate(snapshot.character, turnResponse.player_state_update)
  const newWorld = turnResponse.world_state_update
  const newNpcs = applyNPCUpdates(snapshot.npcs, turnResponse.npc_updates, turnResponse.new_npcs)

  db.updateStory(storyId, newCharacter, newWorld, newNpcs)
  const variant = db.createTurnVariant(lastTurn.id, turnResponse.narrative_text, newCharacter, newWorld, newNpcs)
  db.updateTurnSnapshot(lastTurn.id, {
    narrative_text: turnResponse.narrative_text,
    character: newCharacter,
    world: newWorld,
    npcs: newNpcs,
    action_mode: mode,
    active_variant_id: variant.id,
  })

  return {
    turn_id: lastTurn.id,
    story_id: storyId,
    turn_number: lastTurn.turn_number,
    narrative_text: turnResponse.narrative_text,
    character: newCharacter,
    world: newWorld,
    npcs: newNpcs,
  }
}

export interface SelectVariantResult {
  turn_id: number
  story_id: number
  turn_number: number
  narrative_text: string
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
  active_variant_id: number
}

export function selectTurnVariant(turnId: number, variantId: number): SelectVariantResult {
  const turn = db.getTurn(turnId)
  if (!turn) throw new Error("Turn not found")
  const story = db.getStory(turn.story_id)
  if (!story) throw new Error("Story not found")
  const lastTurn = db.getLastTurnForStory(turn.story_id)
  if (!lastTurn || lastTurn.id !== turnId) throw new Error("Only the last turn can change versions")

  const variant = db.getTurnVariant(variantId)
  if (!variant || variant.turn_id !== turnId) throw new Error("Variant not found")

  const snapshot = parseTurnVariantSnapshot(variant)
  db.updateStory(turn.story_id, snapshot.character, snapshot.world, snapshot.npcs)
  db.updateTurnSnapshot(turn.id, {
    narrative_text: variant.narrative_text,
    character: snapshot.character,
    world: snapshot.world,
    npcs: snapshot.npcs,
    active_variant_id: variant.id,
  })

  return {
    turn_id: turn.id,
    story_id: turn.story_id,
    turn_number: turn.turn_number,
    narrative_text: variant.narrative_text,
    character: snapshot.character,
    world: snapshot.world,
    npcs: snapshot.npcs,
    active_variant_id: variant.id,
  }
}

export function createNewStory(
  title: string,
  opening_scenario: string,
  character: MainCharacterState,
  npcs: NPCState[] = [],
  startingScene?: string,
  characterId: number | null = null,
): number {
  const world: WorldState = {
    current_scene: startingScene?.trim() || "Unknown location",
    day_of_week: "Monday",
    time_of_day: "day",
    recent_events_summary: opening_scenario.slice(0, 200),
  }
  return db.createStory(title, opening_scenario, character, world, npcs, characterId)
}
