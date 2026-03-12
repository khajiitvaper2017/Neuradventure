import type {
  MainCharacterState,
  NPCCreation,
  NPCState,
  NPCStateUpdate,
  TurnResponse,
  WorldState,
} from "../core/models.js"
import { getServerDefaults } from "../core/strings.js"
import { normalizeGender } from "../schemas/normalizers.js"

// ─── State Application ─────────────────────────────────────────────────────────

export function applyPlayerUpdate(character: MainCharacterState, turnResponse: TurnResponse): MainCharacterState {
  const appearance = {
    ...character.appearance,
    current_appearance: turnResponse.appearance_change ?? character.appearance.current_appearance,
    current_clothing: turnResponse.clothing_change ?? character.appearance.current_clothing,
  }

  return {
    ...character,
    appearance,
    inventory: turnResponse.inventory_change ?? character.inventory,
  }
}

export function mergeLocations(
  previous: WorldState["locations"],
  updated: WorldState["locations"],
): WorldState["locations"] {
  const merged = new Map<string, WorldState["locations"][number]>()
  for (const location of previous) {
    const key = location.name.trim().toLowerCase()
    if (!key) continue
    merged.set(key, location)
  }
  for (const location of updated) {
    const key = location.name.trim().toLowerCase()
    if (!key) continue
    merged.set(key, location)
  }
  return Array.from(merged.values())
}

export function syncLocationCharacters(world: WorldState, character: MainCharacterState, npcs: NPCState[]): WorldState {
  const locations = world.locations.map((location) => ({
    ...location,
    characters: [...location.characters],
  }))
  const locationLookup = new Map<string, (typeof locations)[number]>()
  for (const location of locations) {
    const key = location.name.trim().toLowerCase()
    if (!key) continue
    if (!locationLookup.has(key)) locationLookup.set(key, location)
  }

  const playerName = character.name.trim()

  const removeCharacter = (name: string) => {
    const key = name.trim().toLowerCase()
    if (!key) return
    for (const location of locations) {
      location.characters = location.characters.filter((entry) => entry.trim().toLowerCase() !== key)
    }
  }

  if (playerName) removeCharacter(playerName)
  for (const npc of npcs) {
    if (npc.name.trim()) removeCharacter(npc.name)
  }

  const ensureLocation = (locationName: string) => {
    const key = locationName.trim().toLowerCase()
    if (!key) return null
    const existing = locationLookup.get(key)
    if (existing) return existing
    const created = {
      name: locationName.trim(),
      description: getServerDefaults().unknown.locationDetails,
      characters: [],
      available_items: [],
    }
    locations.push(created)
    locationLookup.set(key, created)
    return created
  }

  const currentLocation = ensureLocation(world.current_scene)
  if (currentLocation && playerName) {
    currentLocation.characters.push(playerName)
  }

  for (const npc of npcs) {
    const locationName = npc.current_location.trim()
    if (!locationName) continue
    const location = ensureLocation(locationName)
    if (!location) continue
    location.characters.push(npc.name)
  }

  for (const location of locations) {
    const seen = new Set<string>()
    location.characters = location.characters.filter((entry) => {
      const key = entry.trim()
      if (!key) return false
      const lower = key.toLowerCase()
      if (seen.has(lower)) return false
      seen.add(lower)
      return true
    })
  }

  return { ...world, locations }
}

export function buildNpcFromCreation(creation: NPCCreation): NPCState {
  return {
    ...creation,
    gender: normalizeGender(creation.gender, getServerDefaults().unknown.value),
    inventory: creation.inventory ?? [],
  }
}

export function applyNPCUpdates(npcs: NPCState[], updates: NPCStateUpdate[]): NPCState[] {
  return npcs.map((npc) => {
    const patch = updates.find((u) => u.name.toLowerCase() === npc.name.toLowerCase())
    if (!patch) return npc

    return {
      ...npc,
      race: patch.race ?? npc.race,
      gender: patch.gender ? normalizeGender(patch.gender, npc.gender) : npc.gender,
      current_location: patch.set_current_location ?? npc.current_location,
      appearance: {
        ...npc.appearance,
        current_appearance: patch.set_current_appearance ?? npc.appearance.current_appearance,
        current_clothing: patch.set_current_clothing ?? npc.appearance.current_clothing,
      },
      current_activity: patch.set_current_activity ?? npc.current_activity,
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
  if (worldUpdate.current_date !== undefined) {
    provided += 1
    if (worldUpdate.current_date === world.current_date) unchanged += 1
  }
  if (worldUpdate.memory !== undefined) {
    provided += 1
    if (worldUpdate.memory === world.memory) unchanged += 1
  }
  if (worldUpdate.locations !== undefined) {
    provided += 1
    if (JSON.stringify(worldUpdate.locations) === JSON.stringify(world.locations)) unchanged += 1
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
    if (patch.set_current_location && patch.set_current_location === npc.current_location) {
      warnings.push(`npc_changes[${npc.name}].set_current_location matches existing value`)
    }
    if (patch.set_current_appearance && patch.set_current_appearance === npc.appearance.current_appearance) {
      warnings.push(`npc_changes[${npc.name}].set_current_appearance matches existing value`)
    }
    if (patch.set_current_clothing && patch.set_current_clothing === npc.appearance.current_clothing) {
      warnings.push(`npc_changes[${npc.name}].set_current_clothing matches existing value`)
    }
    if (patch.set_current_activity && patch.set_current_activity === npc.current_activity) {
      warnings.push(`npc_changes[${npc.name}].set_current_activity matches existing value`)
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
