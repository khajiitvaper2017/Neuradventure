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
import { buildTurnMessages, callLLM } from "./llm.js"

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
  if (update.inventory_add.length > 0) {
    updated.inventory = [...updated.inventory, ...update.inventory_add]
  }
  if (update.inventory_remove.length > 0) {
    const removeSet = new Set(update.inventory_remove.map((n) => n.toLowerCase()))
    updated.inventory = updated.inventory.filter((i) => !removeSet.has(i.name.toLowerCase()))
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

export async function processTurn(storyId: number, playerInput: string, actionMode: string): Promise<TurnResult> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)

  const character = MainCharacterStateSchema.parse(JSON.parse(story.character_state_json))
  const world = WorldStateSchema.parse(JSON.parse(story.world_state_json))
  const npcs = (JSON.parse(story.npc_states_json) as unknown[]).map((n) => NPCStateSchema.parse(n))
  const recentTurns = db.getTurnsForStory(storyId)

  const messages = buildTurnMessages(character, world, npcs, recentTurns, playerInput, actionMode)
  const turnResponse = await callLLM(messages)

  const newCharacter = applyPlayerUpdate(character, turnResponse.player_state_update)
  const newWorld = turnResponse.world_state_update
  const newNpcs = applyNPCUpdates(npcs, turnResponse.npc_updates, turnResponse.new_npcs)

  db.updateStory(storyId, newCharacter, newWorld, newNpcs)

  const turnNumber = db.getNextTurnNumber(storyId)
  const turnId = db.createTurn(
    storyId,
    turnNumber,
    playerInput,
    turnResponse.narrative_text,
    newCharacter,
    newWorld,
    newNpcs,
  )

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

export function createNewStory(
  title: string,
  opening_scenario: string,
  character: MainCharacterState,
  npcs: NPCState[] = [],
  startingScene?: string,
): number {
  const world: WorldState = {
    current_scene: startingScene?.trim() || "Unknown location",
    time_of_day: "day",
    recent_events_summary: opening_scenario.slice(0, 200),
  }
  return db.createStory(title, opening_scenario, character, world, npcs)
}
