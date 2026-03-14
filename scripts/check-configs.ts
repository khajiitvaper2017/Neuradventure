import { getServerDefaults, getLlmStrings } from "../src/server/core/strings.js"
import { DB_PATH } from "../src/server/core/db.js"
import { resolve } from "node:path"
import { getConfig, npcTraits } from "../src/server/llm/config.js"
import { buildTurnResponseSchema } from "../src/server/llm/schema.js"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "../src/server/schemas/story-modules.js"
import { derefJsonSchema, zodSchemaToJsonSchema } from "../src/server/utils/json-schema.js"
import { injectSchemaDescriptions } from "../src/server/llm/inject-schema-descriptions.js"
import {
  GenerateChatResponseSchema,
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  buildGenerateCharacterResponseSchema,
  buildStoryResponseSchema,
} from "../src/server/core/models.js"
import { buildNpcCreationSchema } from "../src/server/schemas/npc-creation.js"

function assertNonEmpty(value: unknown, label: string): void {
  if (value === null || value === undefined || value === "") {
    throw new Error(`Missing value: ${label}`)
  }
}

function assertNonEmptyArray(value: unknown, label: string): void {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error(`Missing array entries: ${label}`)
  }
}

function assertIncludesAll(value: unknown, needles: string[], label: string): void {
  if (typeof value !== "string") {
    throw new Error(`Expected string for ${label}`)
  }
  for (const needle of needles) {
    if (!value.includes(needle)) {
      throw new Error(`Missing "${needle}" in ${label}: ${value}`)
    }
  }
}

function assertNoLocationsInTurnSchema(): void {
  const modulesNoLocations = { ...DEFAULT_STORY_MODULES, track_locations: false }
  const zod = buildTurnResponseSchema([], modulesNoLocations)
  const json = derefJsonSchema(zodSchemaToJsonSchema(zod, "TurnResponse")) as Record<string, unknown>
  const properties = json.properties as Record<string, unknown> | undefined
  const worldUpdate = properties?.world_state_update as Record<string, unknown> | undefined
  const worldUpdateProps = worldUpdate?.properties as Record<string, unknown> | undefined
  if (!worldUpdateProps) {
    throw new Error("[check-configs] Unexpected TurnResponse schema shape: missing world_state_update.properties")
  }
  if ("locations" in worldUpdateProps) {
    throw new Error("[check-configs] TurnResponse schema includes world_state_update.locations when track_locations=false")
  }

  const modulesWithLocations = { ...DEFAULT_STORY_MODULES, track_locations: true }
  const zodWith = buildTurnResponseSchema([], modulesWithLocations)
  const jsonWith = derefJsonSchema(zodSchemaToJsonSchema(zodWith, "TurnResponse")) as Record<string, unknown>
  const propertiesWith = jsonWith.properties as Record<string, unknown> | undefined
  const worldUpdateWith = propertiesWith?.world_state_update as Record<string, unknown> | undefined
  const worldUpdatePropsWith = worldUpdateWith?.properties as Record<string, unknown> | undefined
  if (!worldUpdatePropsWith || !("locations" in worldUpdatePropsWith)) {
    throw new Error("[check-configs] TurnResponse schema missing world_state_update.locations when track_locations=true")
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function isPlaceholderDescription(value: unknown): value is string {
  if (typeof value !== "string") return false
  const trimmed = value.trim()
  return trimmed.startsWith("{") && trimmed.endsWith("}") && trimmed.length >= 3
}

function assertNoMissingDescriptions(schemaName: string, schema: object): void {
  const json = derefJsonSchema(schema) as Record<string, unknown>
  const injected = injectSchemaDescriptions(schemaName, json)

  if (injected.missing.length > 0) {
    const sample = injected.missing.slice(0, 20)
    throw new Error(
      `[check-configs] Missing schema-field descriptions for ${schemaName}: ${injected.missing.length}. Examples: ${sample
        .map((m) => m.path)
        .join(", ")}`,
    )
  }

  const walk = (node: unknown, path: string) => {
    if (!isRecord(node)) return
    if (isPlaceholderDescription(node.description)) {
      throw new Error(`[check-configs] Unresolved {..} description in ${schemaName} at ${path}`)
    }
    const props = node.properties
    if (isRecord(props)) {
      for (const [k, v] of Object.entries(props)) walk(v, path ? `${path}.${k}` : k)
    }
    if (node.items) walk(node.items, path)
    for (const key of ["anyOf", "oneOf", "allOf"] as const) {
      const variants = node[key]
      if (Array.isArray(variants)) {
        for (let i = 0; i < variants.length; i++) walk(variants[i], path)
      }
    }
  }

  walk(injected.schema, "")
}

function main() {
  const defaults = getServerDefaults()
  assertNonEmpty(defaults.format?.noneLower, "server-defaults.format.noneLower")
  assertNonEmpty(defaults.unknown?.location, "server-defaults.unknown.location")
  assertNonEmpty(defaults.defaultTimeOfDay, "server-defaults.defaultTimeOfDay")

  const llmStrings = getLlmStrings()
  assertNonEmpty(llmStrings.contextLabels?.nameRaceGender, "llm-strings.contextLabels.nameRaceGender")
  assertNonEmpty(llmStrings.sections?.storySoFar, "llm-strings.sections.storySoFar")
  assertIncludesAll(
    llmStrings.contextLabels?.nameRaceGender,
    ["{race}", "{gender}"],
    "llm-strings.contextLabels.nameRaceGender",
  )
  assertIncludesAll(
    llmStrings.generateCharacter?.userPrompt,
    ["{description}"],
    "llm-strings.generateCharacter.userPrompt",
  )
  assertIncludesAll(llmStrings.contextLabels?.race, ["{value}"], "llm-strings.contextLabels.race")
  assertIncludesAll(llmStrings.contextLabels?.gender, ["{value}"], "llm-strings.contextLabels.gender")

  const promptConfig = getConfig()
  assertNonEmptyArray(promptConfig.systemPromptLines?.base, "prompts.systemPromptLines.base")
  assertNonEmptyArray(promptConfig.generateStoryPrompt?.base, "prompts.generateStoryPrompt.base")
  assertNonEmptyArray(npcTraits, "traits")

  const expectedDbPath = resolve(process.cwd(), "data", "neuradventure.db")
  if (resolve(DB_PATH) !== expectedDbPath) {
    throw new Error(`DB_PATH mismatch. Expected ${expectedDbPath}, got ${DB_PATH}`)
  }

  assertNoLocationsInTurnSchema()

  // Ensure all LLM JSON schemas have per-field descriptions (resolved from schema-fields.json).
  const modules = { ...DEFAULT_STORY_MODULES }
  const flags = resolveModuleFlags(modules)

  const turnZod = buildTurnResponseSchema([], modules)
  assertNoMissingDescriptions("TurnResponse", zodSchemaToJsonSchema(turnZod, "TurnResponse"))

  const storyZod = buildStoryResponseSchema(modules)
  assertNoMissingDescriptions("StoryResponse", zodSchemaToJsonSchema(storyZod, "StoryResponse"))

  const genCharZod = buildGenerateCharacterResponseSchema(modules)
  assertNoMissingDescriptions("GenerateCharacterResponse", zodSchemaToJsonSchema(genCharZod, "GenerateCharacterResponse"))
  assertNoMissingDescriptions(
    "GenerateCharacterAppearanceResponse",
    zodSchemaToJsonSchema(GenerateCharacterAppearanceResponseSchema, "GenerateCharacterAppearanceResponse"),
  )
  assertNoMissingDescriptions(
    "GenerateCharacterClothingResponse",
    zodSchemaToJsonSchema(GenerateCharacterClothingResponseSchema, "GenerateCharacterClothingResponse"),
  )
  assertNoMissingDescriptions(
    "GenerateCharacterTraitsResponse",
    zodSchemaToJsonSchema(GenerateCharacterTraitsResponseSchema, "GenerateCharacterTraitsResponse"),
  )

  const npcCreationZod = buildNpcCreationSchema({
    useNpcAppearance: flags.useNpcAppearance,
    useNpcPersonalityTraits: flags.useNpcPersonalityTraits,
    useNpcMajorFlaws: flags.useNpcMajorFlaws,
    useNpcQuirks: flags.useNpcQuirks,
    useNpcPerks: flags.useNpcPerks,
    useNpcLocation: flags.useNpcLocation,
    useNpcActivity: flags.useNpcActivity,
  })
  assertNoMissingDescriptions("NPCCreation", zodSchemaToJsonSchema(npcCreationZod, "NPCCreation"))

  assertNoMissingDescriptions(
    "GenerateChatResponse",
    zodSchemaToJsonSchema(GenerateChatResponseSchema, "GenerateChatResponse"),
  )

  console.log("Config checks OK")
}

try {
  main()
} catch (err) {
  console.error("[check-configs] Failed:", err)
  process.exit(1)
}
