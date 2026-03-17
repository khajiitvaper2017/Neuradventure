import type {
  MainCharacterState,
  NPCCreation,
  NPCState,
  NPCStateUpdate,
  TurnResponse,
  WorldState,
} from "@/types/models"
import { getServerDefaults } from "@/utils/text/strings"
import { normalizeGender } from "@/domain/story/schemas/normalizers"
import { NPCStateStoredSchema } from "@/types/models"
import type { ModuleFlags } from "@/domain/story/schemas/story-modules"

function mergeCustomFields(
  base: Record<string, string | string[]> | undefined,
  patch: unknown,
): Record<string, string | string[]> {
  const current = base && typeof base === "object" ? base : {}
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return current
  return { ...current, ...(patch as Record<string, string | string[]>) }
}

export function applyPlayerUpdate(
  character: MainCharacterState,
  turnResponse: TurnResponse,
  flags: ModuleFlags,
): MainCharacterState {
  const appearance = flags.useCharAppearance
    ? {
        baseline_appearance: character.baseline_appearance,
        current_appearance: turnResponse.current_appearance ?? character.current_appearance,
        current_clothing: turnResponse.current_clothing ?? character.current_clothing,
      }
    : {
        baseline_appearance: character.baseline_appearance,
        current_appearance: character.current_appearance,
        current_clothing: character.current_clothing,
      }

  return {
    ...character,
    ...appearance,
    current_activity: flags.useCharActivity
      ? (turnResponse.current_activity ?? character.current_activity)
      : character.current_activity,
    inventory: flags.useCharInventory ? (turnResponse.current_inventory ?? character.inventory) : character.inventory,
    custom_fields: mergeCustomFields(character.custom_fields, turnResponse.character_custom_fields),
  }
}

export function buildNpcFromCreation(creation: NPCCreation): NPCState {
  return NPCStateStoredSchema.parse({
    ...creation,
    gender: normalizeGender(creation.gender, getServerDefaults().unknown.value),
  })
}

export function applyNPCUpdates(npcs: NPCState[], updates: NPCStateUpdate[], flags: ModuleFlags): NPCState[] {
  return npcs.map((npc) => {
    const patch = updates.find((u) => u.name.toLowerCase() === npc.name.toLowerCase())
    if (!patch) return npc

    return {
      ...npc,
      race: patch.race ?? npc.race,
      gender: patch.gender ? normalizeGender(patch.gender, npc.gender) : npc.gender,
      current_location: flags.useNpcLocation ? (patch.current_location ?? npc.current_location) : npc.current_location,
      current_appearance: flags.useNpcAppearance
        ? (patch.current_appearance ?? npc.current_appearance)
        : npc.current_appearance,
      current_clothing: flags.useNpcAppearance
        ? (patch.current_clothing ?? npc.current_clothing)
        : npc.current_clothing,
      current_activity: flags.useNpcActivity ? (patch.current_activity ?? npc.current_activity) : npc.current_activity,
      inventory: flags.useNpcInventory ? (patch.inventory ?? npc.inventory) : npc.inventory,
      custom_fields: mergeCustomFields(npc.custom_fields, patch.custom_fields),
    }
  })
}

export function applyNPCCreations(npcs: NPCState[], creations: NPCCreation[]): NPCState[] {
  if (creations.length === 0) return npcs
  const existingNames = new Set(npcs.map((npc) => npc.name.toLowerCase()))
  const newNPCs = creations
    .filter((creation) => !existingNames.has(creation.name.toLowerCase()))
    .map((creation) => buildNpcFromCreation(creation))
  return [...npcs, ...newNPCs]
}

export function syncCharacterLocation(character: MainCharacterState, world: WorldState): MainCharacterState {
  if (character.current_location.trim().toLowerCase() === world.current_scene.trim().toLowerCase()) {
    return character
  }
  return { ...character, current_location: world.current_scene }
}

function findNpcByUpdate(npcs: NPCState[], update: NPCStateUpdate): NPCState | undefined {
  const name = update.name.toLowerCase()
  return npcs.find((npc) => npc.name.toLowerCase() === name)
}

export function collectLlmWarnings(world: WorldState, npcs: NPCState[], turnResponse: TurnResponse): string[] {
  const warnings: string[] = []

  const worldUpdate = turnResponse.world_state_update
  let provided = 0
  let unchanged = 0
  if (worldUpdate.current_scene !== undefined) {
    provided += 1
    if (worldUpdate.current_scene === world.current_scene) unchanged += 1
  }
  if (worldUpdate.time_of_day !== undefined) {
    provided += 1
    if (worldUpdate.time_of_day === world.time_of_day) unchanged += 1
  }
  if (provided > 0 && unchanged === provided) {
    warnings.push("world_state_update matches existing world state")
  }

  const npcUpdates = turnResponse.npc_changes ?? []
  for (const npcUpdate of npcUpdates) {
    const patch = npcUpdate as NPCStateUpdate
    const npc = findNpcByUpdate(npcs, patch)
    if (!npc) {
      warnings.push(`npc_changes[${patch.name}] refers to unknown NPC; use npc_introductions`)
      continue
    }
    if (patch.current_location && patch.current_location === npc.current_location) {
      warnings.push(`npc_changes[${npc.name}].current_location matches existing value`)
    }
    if (patch.current_appearance && patch.current_appearance === npc.current_appearance) {
      warnings.push(`npc_changes[${npc.name}].current_appearance matches existing value`)
    }
    if (patch.current_clothing && patch.current_clothing === npc.current_clothing) {
      warnings.push(`npc_changes[${npc.name}].current_clothing matches existing value`)
    }
    if (patch.current_activity && patch.current_activity === npc.current_activity) {
      warnings.push(`npc_changes[${npc.name}].current_activity matches existing value`)
    }
  }

  const npcCreations = turnResponse.npc_introductions ?? []
  for (const creation of npcCreations) {
    const existing = npcs.find((npc) => npc.name.toLowerCase() === creation.name.toLowerCase())
    if (existing) {
      warnings.push(`npc_introductions[${creation.name}] matches existing NPC name; use npc_changes instead`)
    }
  }

  return warnings
}
