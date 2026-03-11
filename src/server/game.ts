import {
  MainCharacterStateSchema,
  NPCStateStoredSchema,
  WorldStateStoredSchema,
  type MainCharacterState,
  type NPCCreation,
  type NPCStateUpdate,
  type NPCState,
  type TurnResponse,
  type WorldState,
} from "./models.js"
type NPCUpdateArray = Extract<TurnResponse["npc_changes"], { has_updates: true }>["updates"]
import * as db from "./db.js"
import {
  buildNpcCreationMessages,
  buildTurnMessages,
  callLLM,
  generateNpcCreation,
  generatePlayerAction,
  getCtxLimitCached,
} from "./llm.js"

// ─── State Application ─────────────────────────────────────────────────────────

function applyPlayerUpdate(character: MainCharacterState, turnResponse: TurnResponse): MainCharacterState {
  const updated = { ...character, appearance: { ...character.appearance } }

  if (turnResponse.appearance_change.changed) {
    updated.appearance = { ...updated.appearance, physical_description: turnResponse.appearance_change.description }
  }
  if (turnResponse.clothing_change.changed) {
    updated.appearance = { ...updated.appearance, current_clothing: turnResponse.clothing_change.description }
  }
  if (turnResponse.inventory_change.changed) {
    updated.inventory = turnResponse.inventory_change.items
  }

  return updated
}

function buildNpcFromCreation(creation: NPCCreation): NPCState {
  return {
    name: creation.name,
    race: creation.race,
    gender: creation.gender,
    last_known_location: creation.set_location,
    appearance: {
      physical_description: creation.set_appearance,
      current_clothing: creation.set_clothing,
    },
    personality_traits: creation.personality_traits,
    relationship_to_player: creation.set_relationship,
    notes: creation.set_notes,
  }
}

function applyNPCUpdates(npcs: NPCState[], updates: NPCUpdateArray): NPCState[] {
  return npcs.map((npc) => {
    const patch = updates.find((u) => u.name.toLowerCase() === npc.name.toLowerCase())
    if (!patch) return npc

    return {
      ...npc,
      last_known_location: patch.set_location ?? npc.last_known_location,
      appearance: {
        physical_description: patch.set_appearance ?? npc.appearance.physical_description,
        current_clothing: patch.set_clothing ?? npc.appearance.current_clothing,
      },
      relationship_to_player: patch.set_relationship ?? npc.relationship_to_player,
      notes: patch.set_notes ?? npc.notes,
    }
  })
}

function applyNPCCreations(npcs: NPCState[], creations: NPCCreation[]): NPCState[] {
  if (creations.length === 0) return npcs
  const existingNames = new Set(npcs.map((npc) => npc.name.toLowerCase()))
  const newNPCs = creations
    .filter((creation) => !existingNames.has(creation.name.toLowerCase()))
    .map((creation) => buildNpcFromCreation(creation))
  return [...npcs, ...newNPCs]
}

function inventoryEquals(a: MainCharacterState["inventory"], b: MainCharacterState["inventory"]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i].name !== b[i].name || a[i].description !== b[i].description) return false
  }
  return true
}

function findNpcByUpdate(npcs: NPCState[], update: NPCStateUpdate): NPCState | undefined {
  const name = update.name.toLowerCase()
  return npcs.find((npc) => npc.name.toLowerCase() === name)
}

function collectLlmWarnings(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  turnResponse: TurnResponse,
): string[] {
  const warnings: string[] = []

  if (
    turnResponse.appearance_change.changed &&
    turnResponse.appearance_change.description === character.appearance.physical_description
  ) {
    warnings.push("appearance_change flagged but description matches existing value")
  }
  if (
    turnResponse.clothing_change.changed &&
    turnResponse.clothing_change.description === character.appearance.current_clothing
  ) {
    warnings.push("clothing_change flagged but description matches existing value")
  }
  if (
    turnResponse.inventory_change.changed &&
    inventoryEquals(turnResponse.inventory_change.items, character.inventory)
  ) {
    warnings.push("inventory_change flagged but items match existing value")
  }

  const worldUpdate = turnResponse.world_state_update
  if (
    worldUpdate.current_scene === world.current_scene &&
    worldUpdate.time_of_day === world.time_of_day &&
    worldUpdate.day_of_week === world.day_of_week &&
    worldUpdate.recent_events_summary === world.recent_events_summary
  ) {
    warnings.push("world_state_update matches existing world state")
  }

  const npcUpdates = turnResponse.npc_changes.has_updates ? turnResponse.npc_changes.updates : []
  for (const npcUpdate of npcUpdates) {
    const patch = npcUpdate as NPCStateUpdate
    const npc = findNpcByUpdate(npcs, patch)
    if (!npc) {
      warnings.push(`npc_changes.updates[${patch.name}] refers to unknown NPC; use npc_introductions`)
      continue
    }
    if (patch.set_location && patch.set_location === npc.last_known_location) {
      warnings.push(`npc_changes.updates[${npc.name}].set_location matches existing value`)
    }
    if (patch.set_appearance && patch.set_appearance === npc.appearance.physical_description) {
      warnings.push(`npc_changes.updates[${npc.name}].set_appearance matches existing value`)
    }
    if (patch.set_clothing && patch.set_clothing === npc.appearance.current_clothing) {
      warnings.push(`npc_changes.updates[${npc.name}].set_clothing matches existing value`)
    }
    if (patch.set_relationship && patch.set_relationship === npc.relationship_to_player) {
      warnings.push(`npc_changes.updates[${npc.name}].set_relationship matches existing value`)
    }
    if (patch.set_notes && patch.set_notes === npc.notes) {
      warnings.push(`npc_changes.updates[${npc.name}].set_notes matches existing value`)
    }
  }

  const npcCreations = turnResponse.npc_introductions.has_new_npcs ? turnResponse.npc_introductions.npcs : []
  for (const creation of npcCreations) {
    const existing = npcs.find((npc) => npc.name.toLowerCase() === creation.name.toLowerCase())
    if (existing) {
      warnings.push(`npc_introductions[${creation.name}] matches existing NPC name; use npc_changes instead`)
    }
  }

  return warnings
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
  llm_warnings?: string[]
}

export interface CreateNpcResult {
  npc: NPCState
  npcs: NPCState[]
}

export async function createNpcFromTurnPrompt(
  storyId: number,
  npcName: string,
): Promise<CreateNpcResult> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const trimmedName = npcName.trim()
  if (!trimmedName) throw new Error("NPC name is required")

  const character = MainCharacterStateSchema.parse(JSON.parse(story.character_state_json))
  const world = WorldStateStoredSchema.parse(JSON.parse(story.world_state_json))
  const npcs = (JSON.parse(story.npc_states_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))

  if (npcs.some((npc) => npc.name.toLowerCase() === trimmedName.toLowerCase())) {
    throw new Error(`NPC "${trimmedName}" already exists`)
  }

  const recentTurns = db.getTurnsForStory(storyId)
  const ctxLimit = getCtxLimitCached()

  const messages = buildNpcCreationMessages(character, world, npcs, recentTurns, trimmedName, ctxLimit)
  const creation = await generateNpcCreation(messages, trimmedName)
  const updatedNpcs = applyNPCCreations(npcs, [creation])
  const newNpc = buildNpcFromCreation(creation)

  db.updateStory(storyId, character, world, updatedNpcs)

  return {
    npc: newNpc,
    npcs: updatedNpcs,
  }
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
  const world = WorldStateStoredSchema.parse(JSON.parse(story.world_state_json))
  const npcs = (JSON.parse(story.npc_states_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
  const initial = parseInitialStorySnapshot(story).character
  const recentTurns = db.getTurnsForStory(storyId)
  const ctxLimit = getCtxLimitCached()

  const messages = buildTurnMessages(character, world, npcs, recentTurns, playerInput, actionMode, initial, ctxLimit)
  const turnResponse = await callLLM(
    messages,
    npcs.map((n) => n.name),
  )
  const llmWarnings = collectLlmWarnings(character, world, npcs, turnResponse)

  const newCharacter = applyPlayerUpdate(character, turnResponse)
  const newWorld = turnResponse.world_state_update
  const npcUpdates = turnResponse.npc_changes.has_updates ? turnResponse.npc_changes.updates : []
  const updatedNpcs = applyNPCUpdates(npcs, npcUpdates as NPCUpdateArray)
  const npcCreations = turnResponse.npc_introductions.has_new_npcs ? turnResponse.npc_introductions.npcs : []
  const newNpcs = applyNPCCreations(updatedNpcs, npcCreations)

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
    llm_warnings: llmWarnings.length > 0 ? llmWarnings : undefined,
  }
}

export async function impersonatePlayerAction(
  storyId: number,
  actionMode: string,
): Promise<{ player_action: string }> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const character = MainCharacterStateSchema.parse(JSON.parse(story.character_state_json))
  const world = WorldStateStoredSchema.parse(JSON.parse(story.world_state_json))
  const npcs = (JSON.parse(story.npc_states_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
  const initial = parseInitialStorySnapshot(story).character
  const recentTurns = db.getTurnsForStory(storyId)
  const ctxLimit = getCtxLimitCached()

  const action = await generatePlayerAction(character, world, npcs, recentTurns, actionMode, initial, ctxLimit)
  if (!action.trim()) throw new Error("LLM returned empty player action")
  return { player_action: action.trim() }
}

function parseTurnSnapshot(turn: db.TurnRow): { character: MainCharacterState; world: WorldState; npcs: NPCState[] } {
  const character = MainCharacterStateSchema.parse(JSON.parse(turn.character_snapshot_json))
  const world = WorldStateStoredSchema.parse(JSON.parse(turn.world_snapshot_json))
  const npcs = (JSON.parse(turn.npc_snapshot_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
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
  const world = WorldStateStoredSchema.parse(JSON.parse(variant.world_snapshot_json))
  const npcs = (JSON.parse(variant.npc_snapshot_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
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
  const world = WorldStateStoredSchema.parse(JSON.parse(worldJson))
  const npcs = (JSON.parse(npcsJson) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
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
      ? (variants.find((variant) => variant.id === lastTurn.active_variant_id) ?? null)
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
  const historyTurns = turnRows.filter((_, i) => i < turnRows.length - 1)
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
  const turnResponse = await callLLM(
    messages,
    snapshot.npcs.map((n) => n.name),
  )
  const llmWarnings = collectLlmWarnings(snapshot.character, snapshot.world, snapshot.npcs, turnResponse)

  const newCharacter = applyPlayerUpdate(snapshot.character, turnResponse)
  const newWorld = turnResponse.world_state_update
  const npcUpdates = turnResponse.npc_changes.has_updates ? turnResponse.npc_changes.updates : []
  const updatedNpcs = applyNPCUpdates(snapshot.npcs, npcUpdates as NPCUpdateArray)
  const npcCreations = turnResponse.npc_introductions.has_new_npcs ? turnResponse.npc_introductions.npcs : []
  const newNpcs = applyNPCCreations(updatedNpcs, npcCreations)

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
    llm_warnings: llmWarnings.length > 0 ? llmWarnings : undefined,
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
    recent_events_summary: opening_scenario.trim(),
  }
  return db.createStory(title, opening_scenario, character, world, npcs, characterId)
}
