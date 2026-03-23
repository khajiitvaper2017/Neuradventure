import type { CharacterCreation, MainCharacterState, NPCState, TurnResponse, WorldState } from "@/types/models"
import { getServerDefaults } from "@/utils/text/strings"
import { normalizeGender } from "@/domain/story/schemas/normalizers"
import { NPCStateStoredSchema } from "@/types/models"
import { extractCustomFieldPatch, getCharacterPatch } from "@/llm/contract"

function mergeCustomFields(
  base: Record<string, string | string[]> | undefined,
  patch: unknown,
): Record<string, string | string[]> {
  const current = base && typeof base === "object" ? base : {}
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return current
  return { ...current, ...(patch as Record<string, string | string[]>) }
}

function mergeMemories(base: string[] | undefined, patch: unknown): string[] {
  const current = Array.isArray(base) ? base : []
  if (!Array.isArray(patch)) return current

  const next = [...current]
  const seen = new Set(current.map((memory) => memory.trim().toLowerCase()).filter(Boolean))

  for (const entry of patch) {
    if (typeof entry !== "string") continue
    const trimmed = entry.trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    next.push(trimmed)
  }

  return next
}

export type CharacterUpdatePolicy = {
  useAppearance: boolean
  useLocation: boolean
  useActivity: boolean
  useInventory: boolean
  useMemories: boolean
  builtInKeys: readonly string[]
}

export function applyCharacterUpdate<TCharacter extends MainCharacterState | NPCState>(
  character: TCharacter,
  turnResponse: TurnResponse,
  policy: CharacterUpdatePolicy,
): TCharacter {
  const patch = getCharacterPatch(turnResponse, character.name)
  const appearance = policy.useAppearance
    ? {
        baseline_appearance: character.baseline_appearance,
        current_appearance:
          typeof patch?.current_appearance === "string" ? patch.current_appearance : character.current_appearance,
        current_clothing:
          typeof patch?.current_clothing === "string" ? patch.current_clothing : character.current_clothing,
      }
    : {
        baseline_appearance: character.baseline_appearance,
        current_appearance: character.current_appearance,
        current_clothing: character.current_clothing,
      }

  return {
    ...character,
    ...appearance,
    current_location:
      policy.useLocation && typeof patch?.current_location === "string"
        ? patch.current_location
        : character.current_location,
    current_activity: policy.useActivity
      ? typeof patch?.current_activity === "string"
        ? patch.current_activity
        : character.current_activity
      : character.current_activity,
    inventory:
      policy.useInventory && Array.isArray(patch?.inventory)
        ? (patch.inventory as typeof character.inventory)
        : character.inventory,
    memories: policy.useMemories ? mergeMemories(character.memories, patch?.new_memories) : character.memories,
    custom_fields: mergeCustomFields(character.custom_fields, extractCustomFieldPatch(patch, policy.builtInKeys)),
  } as TCharacter
}

export function applyCharacterUpdates<TCharacter extends MainCharacterState | NPCState>(
  characters: TCharacter[],
  turnResponse: TurnResponse,
  policy: CharacterUpdatePolicy,
): TCharacter[] {
  return characters.map((character) => applyCharacterUpdate(character, turnResponse, policy))
}

export function buildCharacterFromCreation(creation: CharacterCreation): NPCState {
  return NPCStateStoredSchema.parse({
    ...creation,
    gender: normalizeGender(creation.gender, getServerDefaults().unknown.value),
  })
}

export function applyCharacterIntroductions(npcs: NPCState[], creations: CharacterCreation[]): NPCState[] {
  if (creations.length === 0) return npcs
  const existingNames = new Set(npcs.map((npc) => npc.name.toLowerCase()))
  const newNPCs = creations
    .filter((creation) => !existingNames.has(creation.name.toLowerCase()))
    .map((creation) => buildCharacterFromCreation(creation))
  return [...npcs, ...newNPCs]
}

export function syncCharacterLocation(character: MainCharacterState, world: WorldState): MainCharacterState {
  if (character.current_location.trim().toLowerCase() === world.current_location.trim().toLowerCase()) {
    return character
  }
  return { ...character, current_location: world.current_location }
}

export function collectLlmWarnings(world: WorldState, npcs: NPCState[], turnResponse: TurnResponse): string[] {
  const warnings: string[] = []

  const worldUpdate = turnResponse.world_state_update
  let provided = 0
  let unchanged = 0
  if (worldUpdate.time_of_day !== undefined) {
    provided += 1
    if (worldUpdate.time_of_day === world.time_of_day) unchanged += 1
  }
  if (provided > 0 && unchanged === provided) {
    warnings.push("world_state_update matches existing world state")
  }

  for (const npc of npcs) {
    const patch = getCharacterPatch(turnResponse, npc.name)
    if (!patch) continue
    if (typeof patch.current_location === "string" && patch.current_location === npc.current_location) {
      warnings.push(`${npc.name}.current_location matches existing value`)
    }
    if (typeof patch.current_appearance === "string" && patch.current_appearance === npc.current_appearance) {
      warnings.push(`${npc.name}.current_appearance matches existing value`)
    }
    if (typeof patch.current_clothing === "string" && patch.current_clothing === npc.current_clothing) {
      warnings.push(`${npc.name}.current_clothing matches existing value`)
    }
    if (typeof patch.current_activity === "string" && patch.current_activity === npc.current_activity) {
      warnings.push(`${npc.name}.current_activity matches existing value`)
    }
  }

  const characterIntroductions = turnResponse.character_introductions ?? []
  for (const creation of characterIntroductions) {
    const existing = npcs.find((npc) => npc.name.toLowerCase() === creation.name.toLowerCase())
    if (existing) {
      warnings.push(
        `character_introductions[${creation.name}] matches existing NPC name; use the root-level "${creation.name}" update object instead`,
      )
    }
  }

  return warnings
}
