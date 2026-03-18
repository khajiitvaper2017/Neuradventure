import type { MainCharacterState, NPCState, StoryModules } from "@/types/types"
import * as db from "@/db/core"
import { MainCharacterStateStoredSchema, NPCStateStoredSchema, WorldStateStoredSchema } from "@/types/models"
import { normalizeStoryModules } from "@/domain/story/schemas/story-modules"

export function parseStoryState(row: db.StoryRow): {
  character: MainCharacterState
  world: ReturnType<typeof WorldStateStoredSchema.parse>
  initialWorld: ReturnType<typeof WorldStateStoredSchema.parse>
  npcs: NPCState[]
} {
  const world = WorldStateStoredSchema.parse(JSON.parse(row.world_state_json))
  const initialWorld = WorldStateStoredSchema.parse(JSON.parse(row.initial_world_state_json ?? row.world_state_json))
  const parsedCharacter = MainCharacterStateStoredSchema.parse(JSON.parse(row.character_state_json))
  const character =
    parsedCharacter.current_location.trim().toLowerCase() === world.current_location.trim().toLowerCase()
      ? parsedCharacter
      : { ...parsedCharacter, current_location: world.current_location }
  const npcs = (JSON.parse(row.npc_states_json) as unknown[]).map((n) => NPCStateStoredSchema.parse(n))
  return { character, world, initialWorld, npcs }
}

export function parseStoryModules(row: db.StoryRow): StoryModules {
  const defaults = db.getSettings().storyDefaults
  try {
    const raw = row.story_modules_json ? (JSON.parse(row.story_modules_json) as unknown) : null
    return normalizeStoryModules(raw, defaults)
  } catch {
    return defaults
  }
}
