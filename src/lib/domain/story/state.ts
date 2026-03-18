import type { MainCharacterState, NPCCreation, NPCState, TurnResponse, WorldState } from "@/types/models"
import { getServerDefaults } from "@/utils/text/strings"
import { normalizeGender } from "@/domain/story/schemas/normalizers"
import { NPCStateStoredSchema } from "@/types/models"
import type { ModuleFlags } from "@/domain/story/schemas/story-modules"

const PLAYER_UPDATE_KEYS = new Set([
  "current_location",
  "current_appearance",
  "current_clothing",
  "current_activity",
  "inventory",
])
const NPC_UPDATE_KEYS = new Set([
  "race",
  "gender",
  "current_location",
  "current_appearance",
  "current_clothing",
  "current_activity",
  "inventory",
])

function mergeCustomFields(
  base: Record<string, string | string[]> | undefined,
  patch: unknown,
): Record<string, string | string[]> {
  const current = base && typeof base === "object" ? base : {}
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return current
  return { ...current, ...(patch as Record<string, string | string[]>) }
}

function getCharacterTurnPatch(turnResponse: TurnResponse, name: string): Record<string, unknown> | null {
  const patch = turnResponse[name]
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null
  return patch as Record<string, unknown>
}

function extractCustomFieldPatch(
  patch: Record<string, unknown> | null,
  builtInKeys: Set<string>,
): Record<string, string | string[]> | undefined {
  if (!patch) return undefined
  const customFields: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (builtInKeys.has(key)) continue
    if (typeof value === "string") {
      customFields[key] = value
      continue
    }
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
      customFields[key] = value as string[]
    }
  }
  return Object.keys(customFields).length > 0 ? customFields : undefined
}

export function applyPlayerUpdate(
  character: MainCharacterState,
  turnResponse: TurnResponse,
  flags: ModuleFlags,
): MainCharacterState {
  const patch = getCharacterTurnPatch(turnResponse, character.name)
  const appearance = flags.useCharAppearance
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
      flags.useCharLocation && typeof patch?.current_location === "string"
        ? patch.current_location
        : character.current_location,
    current_activity: flags.useCharActivity
      ? typeof patch?.current_activity === "string"
        ? patch.current_activity
        : character.current_activity
      : character.current_activity,
    inventory:
      flags.useCharInventory && Array.isArray(patch?.inventory)
        ? (patch.inventory as typeof character.inventory)
        : character.inventory,
    custom_fields: mergeCustomFields(character.custom_fields, extractCustomFieldPatch(patch, PLAYER_UPDATE_KEYS)),
  }
}

export function buildNpcFromCreation(creation: NPCCreation): NPCState {
  return NPCStateStoredSchema.parse({
    ...creation,
    gender: normalizeGender(creation.gender, getServerDefaults().unknown.value),
  })
}

export function applyNPCUpdates(npcs: NPCState[], turnResponse: TurnResponse, flags: ModuleFlags): NPCState[] {
  return npcs.map((npc) => {
    const patch = getCharacterTurnPatch(turnResponse, npc.name)
    if (!patch) return npc

    return {
      ...npc,
      race: typeof patch.race === "string" ? patch.race : npc.race,
      gender: typeof patch.gender === "string" ? normalizeGender(patch.gender, npc.gender) : npc.gender,
      current_location:
        flags.useNpcLocation && typeof patch.current_location === "string"
          ? patch.current_location
          : npc.current_location,
      current_appearance: flags.useNpcAppearance
        ? typeof patch.current_appearance === "string"
          ? patch.current_appearance
          : npc.current_appearance
        : npc.current_appearance,
      current_clothing: flags.useNpcAppearance
        ? typeof patch.current_clothing === "string"
          ? patch.current_clothing
          : npc.current_clothing
        : npc.current_clothing,
      current_activity:
        flags.useNpcActivity && typeof patch.current_activity === "string"
          ? patch.current_activity
          : npc.current_activity,
      inventory:
        flags.useNpcInventory && Array.isArray(patch.inventory)
          ? (patch.inventory as typeof npc.inventory)
          : npc.inventory,
      custom_fields: mergeCustomFields(npc.custom_fields, extractCustomFieldPatch(patch, NPC_UPDATE_KEYS)),
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
    const patch = getCharacterTurnPatch(turnResponse, npc.name)
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

  const npcCreations = turnResponse.npc_introductions ?? []
  for (const creation of npcCreations) {
    const existing = npcs.find((npc) => npc.name.toLowerCase() === creation.name.toLowerCase())
    if (existing) {
      warnings.push(
        `npc_introductions[${creation.name}] matches existing NPC name; use the root-level "${creation.name}" update object instead`,
      )
    }
  }

  return warnings
}
