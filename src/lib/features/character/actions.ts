import { generate } from "@/services/generate"
import { stories } from "@/services/stories"
import type { GenerateCharacterContext } from "@/shared/api-types"
import type { MainCharacterState, StoryModules } from "@/shared/types"

export async function generateCharacterFromDescription(prompt: string, modules: StoryModules, requestId?: string) {
  return generate.character(prompt, modules, requestId)
}

export async function generateCharacterAppearance(
  context: GenerateCharacterContext,
  modules: StoryModules,
  requestId?: string,
) {
  return generate.characterAppearance(context, modules, requestId)
}

export async function generateCharacterTraits(
  context: GenerateCharacterContext,
  modules: StoryModules,
  requestId?: string,
) {
  return generate.characterTraits(context, modules, requestId)
}

export async function generateCharacterClothing(
  context: GenerateCharacterContext,
  modules: StoryModules,
  requestId?: string,
) {
  return generate.characterClothing(context, modules, requestId)
}

export async function importCharacter(
  character: Omit<MainCharacterState, "inventory">,
  tavernCard?: object | null,
  tavernAvatarDataUrl?: string | null,
) {
  if (!tavernCard) {
    if (tavernAvatarDataUrl?.trim()) {
      return stories.importCharacter({
        character,
        tavern_avatar_data_url: tavernAvatarDataUrl.trim(),
      })
    }
    return stories.importCharacter(character)
  }
  return stories.importCharacter({
    character,
    tavern_card: tavernCard,
    ...(tavernAvatarDataUrl ? { tavern_avatar_data_url: tavernAvatarDataUrl } : {}),
  })
}
