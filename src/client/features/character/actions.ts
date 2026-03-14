import { api } from "../../api/client.js"
import type { GenerateCharacterContext, MainCharacterState, StoryModules } from "../../api/client.js"

export async function generateCharacterFromDescription(prompt: string, modules: StoryModules, requestId?: string) {
  return api.generate.character(prompt, modules, requestId)
}

export async function generateCharacterAppearance(
  context: GenerateCharacterContext,
  modules: StoryModules,
  requestId?: string,
) {
  return api.generate.characterAppearance(context, modules, requestId)
}

export async function generateCharacterTraits(
  context: GenerateCharacterContext,
  modules: StoryModules,
  requestId?: string,
) {
  return api.generate.characterTraits(context, modules, requestId)
}

export async function generateCharacterClothing(
  context: GenerateCharacterContext,
  modules: StoryModules,
  requestId?: string,
) {
  return api.generate.characterClothing(context, modules, requestId)
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
