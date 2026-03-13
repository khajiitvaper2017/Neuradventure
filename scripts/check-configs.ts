import { getServerDefaults, getLlmStrings } from "../src/server/core/strings.js"
import { DB_PATH } from "../src/server/core/db.js"
import { resolve } from "node:path"
import { getConfig, npcTraits } from "../src/server/llm/config.js"
import { buildTurnResponseSchema } from "../src/server/llm/schema.js"
import { DEFAULT_STORY_MODULES } from "../src/server/schemas/story-modules.js"
import { derefJsonSchema, zodSchemaToJsonSchema } from "../src/server/utils/json-schema.js"

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

function main() {
  const defaults = getServerDefaults()
  assertNonEmpty(defaults.format?.noneLower, "server-defaults.format.noneLower")
  assertNonEmpty(defaults.unknown?.location, "server-defaults.unknown.location")
  assertNonEmpty(defaults.defaultTimeOfDay, "server-defaults.defaultTimeOfDay")

  const llmStrings = getLlmStrings()
  assertNonEmpty(llmStrings.contextLabels?.nameRaceGender, "llm-strings.contextLabels.nameRaceGender")
  assertNonEmpty(llmStrings.sections?.storySoFar, "llm-strings.sections.storySoFar")

  const promptConfig = getConfig()
  assertNonEmptyArray(promptConfig.systemPromptLines?.base, "prompts.systemPromptLines.base")
  assertNonEmptyArray(promptConfig.generateStoryPrompt?.base, "prompts.generateStoryPrompt.base")
  assertNonEmptyArray(npcTraits, "traits")

  const expectedDbPath = resolve(process.cwd(), "data", "neuradventure.db")
  if (resolve(DB_PATH) !== expectedDbPath) {
    throw new Error(`DB_PATH mismatch. Expected ${expectedDbPath}, got ${DB_PATH}`)
  }

  assertNoLocationsInTurnSchema()

  console.log("Config checks OK")
}

try {
  main()
} catch (err) {
  console.error("[check-configs] Failed:", err)
  process.exit(1)
}
