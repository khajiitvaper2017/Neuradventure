import { MainCharacterStateStoredSchema, NPCStateStoredSchema, WorldStateStoredSchema } from "@/types/models"
import type { CreateNpcResult } from "@/types/api"
import * as db from "@/db/core"
import { buildNpcCreationMessages, generateNpcCreation, getCtxLimitCached } from "@/llm"
import { applyCharacterIntroductions, buildCharacterFromCreation, syncCharacterLocation } from "@/domain/story/state"
import { getAuthorNote, getStoryCharacterBook, getStoryModules } from "@/domain/story/helpers"

export async function createNpcFromTurnPrompt(storyId: number, npcName: string): Promise<CreateNpcResult> {
  const story = db.getStory(storyId)
  if (!story) throw new Error(`Story ${storyId} not found`)
  const modules = getStoryModules(story)
  const characterBook = getStoryCharacterBook(story)
  if (!modules.track_npcs) throw new Error("NPC tracking is disabled for this story")

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
  const messages = buildNpcCreationMessages(
    character,
    world,
    npcs,
    recentTurns,
    trimmedName,
    ctxLimit,
    authorNote,
    modules,
    characterBook,
  )
  const creation = await generateNpcCreation(messages, trimmedName, modules)
  const updatedNpcs = applyCharacterIntroductions(npcs, [creation])
  const newNpc = buildCharacterFromCreation(creation)
  const locationSyncedCharacter = syncCharacterLocation(character, world)
  db.updateStory(storyId, locationSyncedCharacter, world, updatedNpcs)

  return {
    npc: newNpc,
    npcs: updatedNpcs,
  }
}
