import type { MainCharacterState, NPCState, StoryModules, WorldState } from "../core/models.js"
import * as db from "../core/db.js"
import { TIME_OF_DAY_REGEX } from "../schemas/constants.js"
import { getServerDefaults } from "../core/strings.js"

export function createNewStory(
  title: string,
  opening_scenario: string,
  character: MainCharacterState,
  npcs: NPCState[] = [],
  startingScene?: string,
  startingDate?: string,
  startingTime?: string,
  storyModules?: StoryModules,
  characterId: number | null = null,
): number {
  const settings = db.getSettings()
  const now = new Date()
  const fallbackTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`
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
  return db.createStory(
    title,
    opening_scenario,
    locationSyncedCharacter,
    world,
    npcs,
    storyModules ?? settings.storyDefaults,
    characterId,
    settings.defaultAuthorNote ?? "",
    settings.defaultAuthorNoteDepth ?? 4,
    settings.defaultAuthorNotePosition ?? 1,
    settings.defaultAuthorNoteInterval ?? 1,
    settings.defaultAuthorNoteRole ?? 0,
    settings.defaultAuthorNoteEmbedState ?? false,
  )
}
