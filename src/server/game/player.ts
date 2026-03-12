import { MainCharacterStateStoredSchema, NPCStateStoredSchema, WorldStateStoredSchema } from "../core/models.js"
import * as db from "../core/db.js"
import { generatePlayerAction, getCtxLimitCached } from "../llm/index.js"
import { parseInitialStorySnapshot } from "./snapshots.js"
import { getAuthorNote, getStoryModules } from "./helpers.js"

export async function impersonatePlayerAction(storyId: number, actionMode: string): Promise<{ player_action: string }> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)
  const modules = getStoryModules(story)

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
    modules,
  )
  if (!action.trim()) throw new Error("LLM returned empty player action")
  return { player_action: action.trim() }
}
