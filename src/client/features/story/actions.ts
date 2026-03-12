import { api } from "../../api/client.js"
import type { MainCharacterState, StoryModules } from "../../api/client.js"

export async function generateStoryFromDescription(
  prompt: string,
  character: Omit<MainCharacterState, "inventory">,
  modules: StoryModules,
) {
  return api.generate.story(prompt, character, modules)
}
