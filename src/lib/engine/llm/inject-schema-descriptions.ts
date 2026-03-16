import { resolveFieldShortcut } from "@/engine/schemas/field-descriptions"

type MissingDescription = {
  path: string
  attemptedKeys: string[]
}

export type InjectSchemaDescriptionsResult = {
  schema: object
  missing: MissingDescription[]
  replacedPlaceholders: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isPlaceholderDescription(value: unknown): value is string {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  return trimmed.startsWith("{") && trimmed.endsWith("}") && trimmed.length >= 3
}

function unwrapPlaceholder(value: string): string {
  const trimmed = value.trim()
  return trimmed.slice(1, -1).trim()
}

function buildPath(parts: string[]): string {
  return parts.join(".")
}

function basePrefixForSchemaName(schemaName: string): string | null {
  switch (schemaName) {
    case "TurnResponse":
      return "llm.turn_response"
    case "StoryResponse":
      return "generation.story"
    case "GenerateChatResponse":
      return "generation.chat"
    case "NPCCreation":
      return "state.character"
    case "GenerateCharacterResponse":
    case "GenerateCharacterAppearanceResponse":
    case "GenerateCharacterClothingResponse":
      return "state.character"
    case "GenerateCharacterTraitsResponse":
      return "traits"
    default:
      return null
  }
}

function childPrefixOverride(currentPrefix: string, propName: string, schemaName: string): string | null {
  // TurnResponse nested contexts
  if (schemaName === "TurnResponse" && currentPrefix === "llm.turn_response") {
    if (propName === "world_state_update") return "llm.world_state_update"
    if (propName === "current_inventory") return "state.inventory_item"
    if (propName === "npc_changes") return "llm.npc_update"
    if (propName === "npc_introductions") return "state.character"
    if (propName === "character_custom_fields") return "state.character.custom_fields"
  }

  // World state nested contexts
  if (schemaName === "TurnResponse" && currentPrefix === "llm.world_state_update") {
    if (propName === "locations") return "state.location"
    if (propName === "custom_fields") return "llm.world_state_update.custom_fields"
  }

  // Location nested contexts
  if (schemaName === "TurnResponse" && currentPrefix === "state.location") {
    if (propName === "available_items") return "state.inventory_item"
  }

  // StoryResponse nested contexts
  if (schemaName === "StoryResponse" && currentPrefix === "generation.story") {
    if (propName === "pregen_npcs") return "state.character"
  }

  // NPC update nested contexts
  if (schemaName === "TurnResponse" && currentPrefix === "llm.npc_update") {
    if (propName === "custom_fields") return "state.character.custom_fields"
  }

  // Character creation/update nested contexts
  if (
    (schemaName === "NPCCreation" || schemaName === "GenerateCharacterResponse" || schemaName === "StoryResponse") &&
    currentPrefix === "state.character"
  ) {
    if (propName === "custom_fields") return "state.character.custom_fields"
  }

  return null
}

function overrideKeyForProperty(propName: string, currentPrefix: string, schemaName: string): string | null {
  // Traits are described under traits.*, even though they appear on character objects.
  if (
    schemaName === "NPCCreation" ||
    schemaName === "GenerateCharacterResponse" ||
    schemaName === "GenerateCharacterTraitsResponse" ||
    (schemaName === "TurnResponse" && currentPrefix === "state.character") ||
    (schemaName === "StoryResponse" && currentPrefix === "state.character")
  ) {
    if (propName === "personality_traits") return "traits.personality_traits"
    if (propName === "major_flaws") return "traits.major_flaws"
    if (propName === "perks") return "traits.perks"
  }

  return null
}

function resolveFromKeys(keys: string[]): { value: string | null; attempted: string[] } {
  const attempted: string[] = []
  for (const key of keys) {
    if (!key) continue
    attempted.push(key)
    const resolved = resolveFieldShortcut(key)
    if (resolved) return { value: resolved, attempted }
  }
  return { value: null, attempted }
}

export function injectSchemaDescriptions(schemaName: string, derefSchema: object): InjectSchemaDescriptionsResult {
  const basePrefix = basePrefixForSchemaName(schemaName)
  const missing: MissingDescription[] = []
  let replacedPlaceholders = 0

  const resolvePlaceholderInNode = (node: Record<string, unknown>, path: string[]) => {
    if (!isPlaceholderDescription(node.description)) return
    const key = unwrapPlaceholder(node.description)
    const resolved = resolveFieldShortcut(key)
    if (resolved) {
      node.description = resolved
      replacedPlaceholders++
    } else {
      missing.push({ path: buildPath(path), attemptedKeys: [key] })
    }
  }

  const visitProperty = (propName: string, propSchema: unknown, currentPrefix: string, path: string[]): void => {
    if (!isRecord(propSchema)) return

    resolvePlaceholderInNode(propSchema, [...path, propName])

    if (!propSchema.description || (typeof propSchema.description === "string" && !propSchema.description.trim())) {
      const overridden = overrideKeyForProperty(propName, currentPrefix, schemaName)
      const candidateKeys: string[] = []

      if (overridden) candidateKeys.push(overridden)
      if (currentPrefix) candidateKeys.push(`${currentPrefix}.${propName}`)
      candidateKeys.push(propName)
      if (path.length > 0) candidateKeys.push(`${path[path.length - 1]}.${propName}`)

      const { value, attempted } = resolveFromKeys(candidateKeys)
      if (value) {
        propSchema.description = value
      } else if (propSchema.type) {
        missing.push({ path: buildPath([...path, propName]), attemptedKeys: attempted })
      }
    }

    const nextPrefix = childPrefixOverride(currentPrefix, propName, schemaName) ?? currentPrefix

    // Optionally describe array items when a specific item key exists.
    if (propSchema.type === "array" && propSchema.items && isRecord(propSchema.items)) {
      resolvePlaceholderInNode(propSchema.items, [...path, propName])

      if (
        !propSchema.items.description ||
        (typeof propSchema.items.description === "string" && !propSchema.items.description.trim())
      ) {
        const itemKeys: string[] = []
        if (currentPrefix === "state.location" && propName === "characters") {
          itemKeys.push("state.location.character")
        } else if (currentPrefix === "state.location" && propName === "available_items") {
          itemKeys.push("state.location.available_item")
        }
        if (nextPrefix) itemKeys.push(`${nextPrefix}.entry`)

        const { value } = resolveFromKeys(itemKeys)
        if (value) propSchema.items.description = value
      }
    }

    visit(propSchema, nextPrefix, [...path, propName])
  }

  const visit = (node: unknown, currentPrefix: string, path: string[]) => {
    if (!isRecord(node)) return

    resolvePlaceholderInNode(node, path)

    // Recurse into object properties (property descriptions use currentPrefix)
    const properties = node.properties
    if (isRecord(properties)) {
      for (const [propName, propSchema] of Object.entries(properties)) {
        visitProperty(propName, propSchema, currentPrefix, path)
      }
    }

    // Recurse into arrays and unions at this node
    if (node.items) visit(node.items, currentPrefix, path)
    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      const variants = node[key]
      if (Array.isArray(variants)) {
        for (const variant of variants) visit(variant, currentPrefix, path)
      }
    }
  }

  visit(derefSchema, basePrefix ?? "", [])

  return { schema: derefSchema, missing, replacedPlaceholders }
}
