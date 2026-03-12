import {
  MainCharacterStateStoredSchema,
  NPCStateStoredSchema,
  WorldStateStoredSchema,
  type MainCharacterState,
  type NPCCreation,
  type NPCStateUpdate,
  type NPCState,
  type WorldState,
} from "./models.js"
type NPCUpdateArray = NPCStateUpdate[]
import * as db from "./db.js"
import {
  buildNpcCreationMessages,
  buildTurnMessages,
  callLLM,
  generateNpcCreation,
  generatePlayerAction,
  getCtxLimitCached,
} from "./llm.js"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "./schemas/constants.js"
import {
  applyNPCCreations,
  applyNPCUpdates,
  applyPlayerUpdate,
  buildNpcFromCreation,
  collectLlmWarnings,
  mergeLocations,
  syncCharacterLocation,
  syncLocationCharacters,
} from "./game/state.js"
import { parseInitialStorySnapshot, parseTurnSnapshot, parseTurnVariantSnapshot } from "./game/snapshots.js"
import { getServerDefaults } from "./strings.js"

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

export async function createNpcFromTurnPrompt(storyId: number, npcName: string): Promise<CreateNpcResult> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const trimmedName = npcName.trim()
  if (!trimmedName) throw new Error("NPC name is required")

  const character = MainCharacterStateStoredSchema.parse(JSON.parse(story.character_state_json))
  const world = WorldStateStoredSchema.parse(JSON.parse(story.world_state_json))
  const npcs = (JSON.parse(story.npc_states_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))

  if (npcs.some((npc) => npc.name.toLowerCase() === trimmedName.toLowerCase())) {
    throw new Error(`NPC "${trimmedName}" already exists`)
  }

  const recentTurns = db.getTurnsForStory(storyId)
  const ctxLimit = getCtxLimitCached()

  const authorNote = getAuthorNote(story)
  const messages = buildNpcCreationMessages(character, world, npcs, recentTurns, trimmedName, ctxLimit, authorNote)
  const creation = await generateNpcCreation(messages, trimmedName)
  const updatedNpcs = applyNPCCreations(npcs, [creation])
  const newNpc = buildNpcFromCreation(creation)
  const syncedWorld = syncLocationCharacters(world, character, updatedNpcs)
  const locationSyncedCharacter = syncCharacterLocation(character, syncedWorld)
  db.updateStory(storyId, locationSyncedCharacter, syncedWorld, updatedNpcs)

  return {
    npc: newNpc,
    npcs: updatedNpcs,
  }
}

function getAuthorNote(story: db.StoryRow): { text: string; depth: number } | null {
  const text = story.author_note ?? ""
  if (!text.trim()) return null
  return { text, depth: story.author_note_depth ?? 4 }
}

export async function processTurn(
  storyId: number,
  playerInput: string,
  actionMode: string,
  requestId?: string,
): Promise<TurnResult> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const character = MainCharacterStateStoredSchema.parse(JSON.parse(story.character_state_json))
  const world = WorldStateStoredSchema.parse(JSON.parse(story.world_state_json))
  const npcs = (JSON.parse(story.npc_states_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
  const initial = parseInitialStorySnapshot(story).character
  const recentTurns = db.getTurnsForStory(storyId)
  const ctxLimit = getCtxLimitCached()
  const authorNote = getAuthorNote(story)

  const messages = buildTurnMessages(
    character,
    world,
    npcs,
    recentTurns,
    playerInput,
    actionMode,
    initial,
    ctxLimit,
    authorNote,
  )
  const turnResponse = await callLLM(messages, npcs)
  const llmWarnings = collectLlmWarnings(world, npcs, turnResponse)

  const newCharacter = applyPlayerUpdate(character, turnResponse)
  const npcUpdates: NPCUpdateArray = turnResponse.npc_changes ?? []
  const updatedNpcs = applyNPCUpdates(npcs, npcUpdates)
  const npcCreations: NPCCreation[] = turnResponse.npc_introductions ?? []
  const newNpcs = applyNPCCreations(updatedNpcs, npcCreations)
  const worldUpdate = turnResponse.world_state_update
  const mergedLocations = mergeLocations(world.locations, worldUpdate.locations)
  const newWorld = syncLocationCharacters({ ...worldUpdate, locations: mergedLocations }, newCharacter, newNpcs)
  const locationSyncedCharacter = syncCharacterLocation(newCharacter, newWorld)

  db.updateStory(storyId, locationSyncedCharacter, newWorld, newNpcs)

  const turnNumber = db.getNextTurnNumber(storyId)
  const turnId = db.createTurn(
    storyId,
    turnNumber,
    actionMode,
    requestId ?? null,
    playerInput,
    turnResponse.narrative_text,
    locationSyncedCharacter,
    newWorld,
    newNpcs,
  )
  const variant = db.createTurnVariant(turnId, turnResponse.narrative_text, locationSyncedCharacter, newWorld, newNpcs)
  db.setActiveTurnVariant(turnId, variant.id)

  return {
    turn_id: turnId,
    story_id: storyId,
    turn_number: turnNumber,
    narrative_text: turnResponse.narrative_text,
    character: locationSyncedCharacter,
    world: newWorld,
    npcs: newNpcs,
    llm_warnings: llmWarnings.length > 0 ? llmWarnings : undefined,
  }
}

export async function impersonatePlayerAction(storyId: number, actionMode: string): Promise<{ player_action: string }> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const character = MainCharacterStateStoredSchema.parse(JSON.parse(story.character_state_json))
  const world = WorldStateStoredSchema.parse(JSON.parse(story.world_state_json))
  const npcs = (JSON.parse(story.npc_states_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
  const initial = parseInitialStorySnapshot(story).character
  const recentTurns = db.getTurnsForStory(storyId)
  const ctxLimit = getCtxLimitCached()

  const authorNote = getAuthorNote(story)
  const action = await generatePlayerAction(
    character,
    world,
    npcs,
    recentTurns,
    actionMode,
    initial,
    ctxLimit,
    authorNote,
  )
  if (!action.trim()) throw new Error("LLM returned empty player action")
  return { player_action: action.trim() }
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
  const authorNote = getAuthorNote(story)
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
    authorNote,
  )
  const turnResponse = await callLLM(messages, snapshot.npcs)
  const llmWarnings = collectLlmWarnings(snapshot.world, snapshot.npcs, turnResponse)

  const newCharacter = applyPlayerUpdate(snapshot.character, turnResponse)
  const newWorld = turnResponse.world_state_update
  const npcUpdates: NPCUpdateArray = turnResponse.npc_changes ?? []
  const updatedNpcs = applyNPCUpdates(snapshot.npcs, npcUpdates)
  const npcCreations: NPCCreation[] = turnResponse.npc_introductions ?? []
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
  startingDate?: string,
  startingTime?: string,
  characterId: number | null = null,
): number {
  const now = new Date()
  const fallbackDate = now.toISOString().slice(0, 10)
  const fallbackTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`
  const dateCandidate = startingDate?.trim()
  const timeCandidate = startingTime?.trim()
  const sceneName = startingScene?.trim() || getServerDefaults().unknown.location
  const locationSyncedCharacter = { ...character, current_location: sceneName }
  const sceneCharacters = [
    locationSyncedCharacter.name,
    ...npcs
      .filter((npc) => npc.current_location.trim().toLowerCase() === sceneName.trim().toLowerCase())
      .map((npc) => npc.name),
  ]
  const world: WorldState = {
    current_scene: sceneName,
    current_date: dateCandidate && DATE_REGEX.test(dateCandidate) ? dateCandidate : fallbackDate,
    time_of_day: timeCandidate && TIME_OF_DAY_REGEX.test(timeCandidate) ? timeCandidate : fallbackTime,
    memory: opening_scenario.trim(),
    locations: [
      {
        name: sceneName,
        description: getServerDefaults().unknown.locationDetails,
        characters: sceneCharacters,
        available_items: [],
      },
    ],
  }
  return db.createStory(title, opening_scenario, locationSyncedCharacter, world, npcs, characterId)
}
