import type { NPCState } from "@/shared/types"
import type { StoryCharacterGroup } from "@/shared/api-types"

export function characterToNpc(character: StoryCharacterGroup["character"]): NPCState {
  return {
    name: character.name,
    race: character.race,
    gender: character.gender,
    general_description: character.general_description,
    current_location: character.current_location,
    baseline_appearance: character.baseline_appearance,
    current_appearance: character.current_appearance,
    current_clothing: character.current_clothing,
    personality_traits: [...character.personality_traits],
    major_flaws: [...character.major_flaws],
    quirks: [...character.quirks],
    perks: [...character.perks],
    inventory: [],
    current_activity: "",
  }
}
