import { generate } from "@/services/generate"
import type { MainCharacterState, NPCState, StoryModules } from "@/types/types"

export async function generateStoryFromDescription(
  prompt: string,
  character: Omit<MainCharacterState, "inventory">,
  modules: StoryModules,
  requestId?: string,
  selectedNpcs?: NPCState[],
) {
  return generate.story(prompt, character, modules, requestId, selectedNpcs)
}
