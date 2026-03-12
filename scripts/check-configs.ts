import { getServerDefaults, getLlmStrings } from "../src/server/core/strings.js"
import { DB_PATH } from "../src/server/core/db.js"
import { resolve } from "node:path"
import { getConfig, npcTraits } from "../src/server/llm/config.js"

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

  console.log("Config checks OK")
}

try {
  main()
} catch (err) {
  console.error("[check-configs] Failed:", err)
  process.exit(1)
}
