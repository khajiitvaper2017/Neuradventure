import { MainCharacterStateStoredSchema, NPCStateStoredSchema, WorldStateStoredSchema } from "../core/models.js"
import type { CreateNpcResult } from "../../../../shared/api-types.js"
import * as db from "../core/db.js"
import { buildNpcCreationMessages, generateNpcCreation, getCtxLimitCached } from "../llm/index.js"
import { applyNPCCreations, buildNpcFromCreation, syncCharacterLocation, syncLocationCharacters } from "./state.js"
import { getAuthorNote, getStoryCharacterBook, getStoryModules } from "./helpers.js"

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
  const updatedNpcs = applyNPCCreations(npcs, [creation])
  const newNpc = buildNpcFromCreation(creation)
  const syncedWorld = modules.track_locations ? syncLocationCharacters(world, character, updatedNpcs) : world
  const locationSyncedCharacter = syncCharacterLocation(character, syncedWorld)
  db.updateStory(storyId, locationSyncedCharacter, syncedWorld, updatedNpcs)

  return {
    npc: newNpc,
    npcs: updatedNpcs,
  }
}
