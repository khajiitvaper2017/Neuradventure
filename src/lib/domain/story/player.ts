import { MainCharacterStateStoredSchema, NPCStateStoredSchema, WorldStateStoredSchema } from "@/types/models"
import * as db from "@/db/core"
import { generatePlayerAction, getCtxLimitCached } from "@/llm/index"
import { parseInitialStorySnapshot } from "@/domain/story/snapshots"
import { getAuthorNote, getStoryModules } from "@/domain/story/helpers"

export async function impersonatePlayerAction(
  storyId: number,
  actionMode: string,
  _requestId?: string,
  options: { onText?: (text: string) => void } = {},
): Promise<{ player_action: string }> {
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
    { onText: options.onText },
  )
  if (!action.trim()) throw new Error("LLM returned empty player action")
  return { player_action: action.trim() }
}
