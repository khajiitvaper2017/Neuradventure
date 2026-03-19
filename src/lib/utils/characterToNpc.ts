import type { NPCState } from "@/types/types"
import type { StoryCharacterGroup } from "@/types/api"

export function characterToNpc(character: StoryCharacterGroup["character"]): NPCState {
  return {
    name: character.name,
    race: character.race,
    gender: character.gender,
    general_description: character.general_description,
    current_location: character.current_location,
    current_activity: character.current_activity,
    baseline_appearance: character.baseline_appearance,
    current_appearance: character.current_appearance,
    current_clothing: character.current_clothing,
    personality_traits: [...character.personality_traits],
    major_flaws: [...character.major_flaws],
    perks: [...character.perks],
    inventory: [],
    memories: [...character.memories],
    custom_fields: { ...(character.custom_fields ?? {}) },
  }
}
