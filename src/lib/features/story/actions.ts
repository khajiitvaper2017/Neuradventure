import { generate } from "@/services/generate"
import type { MainCharacterState, StoryModules } from "@/types/types"

export async function generateStoryFromDescription(
  prompt: string,
  character: Omit<MainCharacterState, "inventory">,
  modules: StoryModules,
  requestId?: string,
) {
  return generate.story(prompt, character, modules, requestId)
}
