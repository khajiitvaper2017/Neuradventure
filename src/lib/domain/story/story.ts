import type { MainCharacterState, NPCState, StoryModules, WorldState } from "@/types/models"
import * as db from "@/db/core"
import { TIME_OF_DAY_REGEX } from "@/domain/story/schemas/constants"
import { getServerDefaults } from "@/utils/text/strings"

export function createNewStory(
  title: string,
  opening_scenario: string,
  character: MainCharacterState,
  npcs: NPCState[] = [],
  startingLocation?: string,
  startingDate?: string,
  startingTime?: string,
  storyModules?: StoryModules,
  characterId: number | null = null,
): number {
  void startingDate
  const settings = db.getSettings()
  const modules = storyModules ?? settings.storyDefaults
  const now = new Date()
  const fallbackTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`
  const timeCandidate = startingTime?.trim()
  const currentLocation = startingLocation?.trim() || getServerDefaults().unknown.location
  const locationSyncedCharacter: MainCharacterState = { ...character, current_location: currentLocation }
  if (modules.character_appearance_clothing) {
    if (!locationSyncedCharacter.current_appearance.trim()) {
      locationSyncedCharacter.current_appearance = locationSyncedCharacter.baseline_appearance.trim()
    }
  } else {
    locationSyncedCharacter.current_appearance = ""
  }
  const world: WorldState = {
    current_location: currentLocation,
    time_of_day: timeCandidate && TIME_OF_DAY_REGEX.test(timeCandidate) ? timeCandidate : fallbackTime,
    custom_fields: {},
  }
  return db.createStory(
    title,
    opening_scenario,
    locationSyncedCharacter,
    world,
    npcs,
    modules,
    characterId,
    settings.defaultAuthorNote ?? "",
    settings.defaultAuthorNoteDepth ?? 4,
    settings.defaultAuthorNotePosition ?? 1,
    settings.defaultAuthorNoteInterval ?? 1,
    settings.defaultAuthorNoteRole ?? 0,
    settings.defaultAuthorNoteEmbedState ?? false,
  )
}
