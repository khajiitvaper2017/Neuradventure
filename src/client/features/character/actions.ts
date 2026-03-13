import { api } from "../../api/client.js"
import type { GenerateCharacterContext, MainCharacterState, StoryModules } from "../../api/client.js"

export async function generateCharacterFromDescription(prompt: string, modules: StoryModules) {
  return api.generate.character(prompt, modules)
}

export async function generateCharacterAppearance(context: GenerateCharacterContext, modules: StoryModules) {
  return api.generate.characterAppearance(context, modules)
}

export async function generateCharacterTraits(context: GenerateCharacterContext, modules: StoryModules) {
  return api.generate.characterTraits(context, modules)
}

export async function generateCharacterClothing(context: GenerateCharacterContext, modules: StoryModules) {
  return api.generate.characterClothing(context, modules)
}

export async function importCharacter(
  character: Omit<MainCharacterState, "inventory">,
  tavernCard?: object | null,
  tavernAvatarDataUrl?: string | null,
) {
  if (!tavernCard) return api.stories.importCharacter(character)
  return api.stories.importCharacter({
    character,
    tavern_card: tavernCard,
    ...(tavernAvatarDataUrl ? { tavern_avatar_data_url: tavernAvatarDataUrl } : {}),
  })
}
