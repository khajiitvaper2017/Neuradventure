import {
  MainCharacterStateStoredSchema,
  NPCStateStoredSchema,
  WorldStateStoredSchema,
  type MainCharacterState,
  type NPCCreation,
  type NPCStateUpdate,
  type NPCState,
  type StoryModules,
  type TurnResponse,
  type WorldState,
} from "@/engine/core/models"
import type { CancelLastResult, SelectVariantResult, TurnResult, UndoCancelResult } from "@/shared/api-types"
import * as db from "@/engine/core/db"
import { buildTurnMessages, callLLM, getCtxLimitCached } from "@/engine/llm"
import { resolveModuleFlags } from "@/engine/schemas/story-modules"
import {
  applyNPCCreations,
  applyNPCUpdates,
  applyPlayerUpdate,
  collectLlmWarnings,
  mergeLocations,
  syncCharacterLocation,
  syncLocationCharacters,
} from "@/engine/game/state"
import { parseInitialStorySnapshot, parseTurnSnapshot, parseTurnVariantSnapshot } from "@/engine/game/snapshots"
import { getAuthorNote, getStoryCharacterBook, getStoryModules } from "@/engine/game/helpers"

type ActionMode = UndoCancelResult["action_mode"]

function coerceActionMode(value: unknown): ActionMode {
  return value === "do" || value === "say" || value === "story" ? value : "do"
}

type TurnSnapshot = {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

type NPCUpdateArray = NPCStateUpdate[]

function buildWorldUpdate(baseWorld: WorldState, update: TurnResponse["world_state_update"], modules: StoryModules) {
  const nextCurrentScene = update.current_scene ?? baseWorld.current_scene
  const nextTimeOfDay = update.time_of_day ?? baseWorld.time_of_day
  const nextLocations =
    modules.track_locations && update.locations
      ? mergeLocations(baseWorld.locations, update.locations)
      : baseWorld.locations

  return {
    current_scene: nextCurrentScene,
    time_of_day: nextTimeOfDay,
    memory: baseWorld.memory,
    locations: nextLocations,
  }
}

function applyTurnResponse(
  snapshot: TurnSnapshot,
  response: TurnResponse,
  modules: StoryModules,
  options: { syncCharacterLocation?: boolean } = {},
) {
  const flags = resolveModuleFlags(modules)
  const newCharacter = applyPlayerUpdate(snapshot.character, response, flags)
  const npcUpdates: NPCUpdateArray = modules.track_npcs ? (response.npc_changes ?? []) : []
  const updatedNpcs = modules.track_npcs ? applyNPCUpdates(snapshot.npcs, npcUpdates, flags) : snapshot.npcs
  const npcCreations: NPCCreation[] = modules.track_npcs ? (response.npc_introductions ?? []) : []
  const newNpcs = modules.track_npcs ? applyNPCCreations(updatedNpcs, npcCreations) : updatedNpcs
  const nextWorld = buildWorldUpdate(snapshot.world, response.world_state_update, modules)
  const newWorld = modules.track_locations ? syncLocationCharacters(nextWorld, newCharacter, newNpcs) : nextWorld
  const finalCharacter = options.syncCharacterLocation ? syncCharacterLocation(newCharacter, newWorld) : newCharacter
  return { character: finalCharacter, world: newWorld, npcs: newNpcs }
}

export async function processTurn(
  storyId: number,
  playerInput: string,
  actionMode: string,
  requestId?: string,
  options: { onPreviewPatch?: (patch: Record<string, unknown>) => void } = {},
): Promise<TurnResult> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)
  const modules = getStoryModules(story)
  const characterBook = getStoryCharacterBook(story)

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
    modules,
    characterBook,
  )
  const turnResponse = await callLLM(messages, npcs, modules, { onPreviewPatch: options.onPreviewPatch })
  const llmWarnings = collectLlmWarnings(world, npcs, turnResponse)
  const backgroundEvents = turnResponse.background_events ?? null

  const updated = applyTurnResponse({ character, world, npcs }, turnResponse, modules, {
    syncCharacterLocation: true,
  })

  db.updateStory(storyId, updated.character, updated.world, updated.npcs)

  const turnNumber = db.getNextTurnNumber(storyId)
  const turnId = db.createTurn(
    storyId,
    turnNumber,
    actionMode,
    requestId ?? null,
    playerInput,
    turnResponse.narrative_text,
    backgroundEvents,
    updated.character,
    updated.world,
    updated.npcs,
  )
  const variant = db.createTurnVariant(
    turnId,
    turnResponse.narrative_text,
    backgroundEvents,
    updated.character,
    updated.world,
    updated.npcs,
  )
  db.setActiveTurnVariant(turnId, variant.id)

  return {
    turn_id: turnId,
    story_id: storyId,
    turn_number: turnNumber,
    narrative_text: turnResponse.narrative_text,
    background_events: backgroundEvents,
    character: updated.character,
    world: updated.world,
    npcs: updated.npcs,
    llm_warnings: llmWarnings.length > 0 ? llmWarnings : undefined,
  }
}

export function buildTurnResultFromRow(turn: db.TurnRow): TurnResult {
  const snapshot = parseTurnSnapshot(turn)
  return {
    turn_id: turn.id,
    story_id: turn.story_id,
    turn_number: turn.turn_number,
    narrative_text: turn.narrative_text,
    background_events: turn.background_events ?? null,
    character: snapshot.character,
    world: snapshot.world,
    npcs: snapshot.npcs,
  }
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
      background_events: variant.background_events ?? null,
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
    background_events: lastTurn.background_events ?? null,
    character: lastSnapshot.character,
    world: lastSnapshot.world,
    npcs: lastSnapshot.npcs,
    variants: variantPayloads,
  })

  db.deleteTurn(lastTurn.id)
  const newLast = db.getLastTurnForStory(storyId)
  const snapshot = newLast ? parseTurnSnapshot(newLast) : parseInitialStorySnapshot(story)
  db.updateStory(storyId, snapshot.character, snapshot.world, snapshot.npcs)

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
    canceled.background_events ?? null,
    canceled.character,
    canceled.world,
    canceled.npcs,
  )

  let activeVariantId: number | null = null
  let lastVariantId: number | null = null
  const sortedVariants = [...canceled.variants].sort((a, b) => a.variant_index - b.variant_index)
  for (const variant of sortedVariants) {
    const created = db.createTurnVariant(
      turnId,
      variant.narrative_text,
      variant.background_events ?? null,
      variant.character,
      variant.world,
      variant.npcs,
    )
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
    action_mode: coerceActionMode(canceled.action_mode),
    player_input: canceled.player_input,
    narrative_text: canceled.narrative_text,
    background_events: canceled.background_events ?? null,
    active_variant_id: activeVariantId,
    character: canceled.character,
    world: canceled.world,
    npcs: canceled.npcs,
  }
}

export async function regenerateLastTurn(
  storyId: number,
  actionMode?: string,
  _requestId?: string,
  options: { onPreviewPatch?: (patch: Record<string, unknown>) => void } = {},
): Promise<TurnResult> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)
  const modules = getStoryModules(story)
  const characterBook = getStoryCharacterBook(story)

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
    modules,
    characterBook,
  )
  const turnResponse = await callLLM(messages, snapshot.npcs, modules, { onPreviewPatch: options.onPreviewPatch })
  const llmWarnings = collectLlmWarnings(snapshot.world, snapshot.npcs, turnResponse)
  const backgroundEvents = turnResponse.background_events ?? null

  const updated = applyTurnResponse(snapshot, turnResponse, modules)

  db.updateStory(storyId, updated.character, updated.world, updated.npcs)
  const variant = db.createTurnVariant(
    lastTurn.id,
    turnResponse.narrative_text,
    backgroundEvents,
    updated.character,
    updated.world,
    updated.npcs,
  )
  db.updateTurnSnapshot(lastTurn.id, {
    narrative_text: turnResponse.narrative_text,
    background_events: backgroundEvents,
    character: updated.character,
    world: updated.world,
    npcs: updated.npcs,
    action_mode: mode,
    active_variant_id: variant.id,
  })

  return {
    turn_id: lastTurn.id,
    story_id: storyId,
    turn_number: lastTurn.turn_number,
    narrative_text: turnResponse.narrative_text,
    background_events: backgroundEvents,
    character: updated.character,
    world: updated.world,
    npcs: updated.npcs,
    llm_warnings: llmWarnings.length > 0 ? llmWarnings : undefined,
  }
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
    background_events: variant.background_events ?? null,
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
    background_events: variant.background_events ?? null,
    character: snapshot.character,
    world: snapshot.world,
    npcs: snapshot.npcs,
    active_variant_id: variant.id,
  }
}
