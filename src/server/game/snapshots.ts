import {
  MainCharacterStateStoredSchema,
  NPCStateStoredSchema,
  WorldStateStoredSchema,
  type MainCharacterState,
  type NPCState,
  type WorldState,
} from "../models.js"
import type { StoryRow, TurnRow, TurnVariantRow } from "../db.js"

export function parseTurnSnapshot(turn: TurnRow): {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
} {
  const character = MainCharacterStateStoredSchema.parse(JSON.parse(turn.character_snapshot_json))
  const world = WorldStateStoredSchema.parse(JSON.parse(turn.world_snapshot_json))
  const npcs = (JSON.parse(turn.npc_snapshot_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
  return { character, world, npcs }
}

export function parseTurnVariantSnapshot(variant: TurnVariantRow): {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
} {
  const character = MainCharacterStateStoredSchema.parse(JSON.parse(variant.character_snapshot_json))
  const world = WorldStateStoredSchema.parse(JSON.parse(variant.world_snapshot_json))
  const npcs = (JSON.parse(variant.npc_snapshot_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
  return { character, world, npcs }
}

export function parseInitialStorySnapshot(story: StoryRow): {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
} {
  const characterJson = story.initial_character_state_json ?? story.character_state_json
  const worldJson = story.initial_world_state_json ?? story.world_state_json
  const npcsJson = story.initial_npc_states_json ?? story.npc_states_json
  const character = MainCharacterStateStoredSchema.parse(JSON.parse(characterJson))
  const world = WorldStateStoredSchema.parse(JSON.parse(worldJson))
  const npcs = (JSON.parse(npcsJson) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
  return { character, world, npcs }
}
