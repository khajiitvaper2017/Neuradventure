import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import { z } from "zod"
import { getDb } from "./connection.js"
import { PromptConfigSchema, type PromptConfig } from "../../llm/prompt-types.js"

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHARED_PROMPTS_DIR = join(__dirname, "../../../../shared/config/prompts")

const PROMPT_CONFIG_SOURCES = [
  { name: "narrative-turn", file: "narrative-turn.json" },
  { name: "character-generation", file: "character-generation.json" },
  { name: "story-setup", file: "story-setup.json" },
  { name: "chat-mode", file: "chat-mode.json" },
  { name: "npc-creation", file: "npc-creation.json" },
  { name: "player-impersonation", file: "player-impersonation.json" },
] as const

export type PromptConfigKey = (typeof PROMPT_CONFIG_SOURCES)[number]["name"]
export const PROMPT_CONFIG_KEYS = PROMPT_CONFIG_SOURCES.map((x) => x.name) as PromptConfigKey[]

const PromptConfigKeySchema = z.enum(PROMPT_CONFIG_KEYS as unknown as [PromptConfigKey, ...PromptConfigKey[]])

const PromptConfigFileSchema = PromptConfigSchema.partial().passthrough()

function stripGlobalPromptKeys(raw: unknown): unknown {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return raw
  const obj = raw as Record<string, unknown>
  if (!("sectionFormat" in obj)) return raw
  // `sectionFormat` is a global app setting (stored in settings), not a per-prompt template option.
  const cloned = { ...obj }
  delete cloned.sectionFormat
  return cloned
}

function nowSql(): string {
  // Millisecond-ish resolution for cache invalidation.
  return "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
}

function getSourceFor(name: PromptConfigKey): string {
  const src = PROMPT_CONFIG_SOURCES.find((x) => x.name === name)
  return join(SHARED_PROMPTS_DIR, src?.file ?? `${name}.json`)
}

function readPromptConfigFileFromDisk(name: PromptConfigKey): unknown {
  const path = getSourceFor(name)
  return JSON.parse(readFileSync(path, "utf-8")) as unknown
}

export function ensurePromptConfigDefaults(): void {
  const database = getDb()
  const upsert = database.prepare(
    `INSERT INTO prompt_configs (name, config_json, updated_at)
     VALUES (?, ?, ${nowSql()})
     ON CONFLICT(name) DO NOTHING`,
  )
  for (const name of PROMPT_CONFIG_KEYS) {
    try {
      const raw = readPromptConfigFileFromDisk(name)
      const parsed = PromptConfigFileSchema.parse(raw)
      upsert.run(name, JSON.stringify(stripGlobalPromptKeys(parsed)))
    } catch {
      // If a default file is invalid, skip inserting it rather than crashing startup.
    }
  }
}

export type PromptConfigFileRow = {
  name: PromptConfigKey
  config_json: string
  updated_at: string
}

export function listPromptConfigFiles(): PromptConfigFileRow[] {
  const database = getDb()
  const get = database.prepare("SELECT name, config_json, updated_at FROM prompt_configs WHERE name = ?")
  const out: PromptConfigFileRow[] = []
  for (const name of PROMPT_CONFIG_KEYS) {
    const row = get.get(name) as PromptConfigFileRow | undefined
    if (!row) continue
    out.push(row)
  }
  return out
}

function mergePromptConfigFiles(files: Record<PromptConfigKey, unknown>): PromptConfig {
  const merged: Record<string, unknown> = {}
  for (const name of PROMPT_CONFIG_KEYS) {
    const payload = files[name]
    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const sanitized = { ...(payload as Record<string, unknown>) }
      delete sanitized.sectionFormat
      Object.assign(merged, sanitized)
    }
  }
  return PromptConfigSchema.parse(merged)
}

function loadPromptConfigFilesFromDb(): Record<PromptConfigKey, unknown> {
  const database = getDb()
  const get = database.prepare("SELECT config_json FROM prompt_configs WHERE name = ?")
  const out = {} as Record<PromptConfigKey, unknown>
  for (const name of PROMPT_CONFIG_KEYS) {
    const row = get.get(name) as { config_json: string } | undefined
    if (!row) {
      out[name] = stripGlobalPromptKeys(readPromptConfigFileFromDisk(name))
      continue
    }
    try {
      out[name] = stripGlobalPromptKeys(JSON.parse(row.config_json) as unknown)
    } catch {
      out[name] = stripGlobalPromptKeys(readPromptConfigFileFromDisk(name))
    }
  }
  return out
}

let cachedConfig: PromptConfig | null = null
let cachedMaxUpdatedAt = ""

export function getMergedPromptConfig(): PromptConfig {
  const database = getDb()
  const maxRow = database.prepare("SELECT MAX(updated_at) as max_updated_at FROM prompt_configs").get() as
    | { max_updated_at: string | null }
    | undefined
  const maxUpdatedAt = maxRow?.max_updated_at ?? ""
  if (cachedConfig && maxUpdatedAt && maxUpdatedAt === cachedMaxUpdatedAt) return cachedConfig

  const files = loadPromptConfigFilesFromDb()
  try {
    cachedConfig = mergePromptConfigFiles(files)
    cachedMaxUpdatedAt = maxUpdatedAt
    return cachedConfig
  } catch {
    // Last-resort fallback to disk defaults.
    const disk: Record<PromptConfigKey, unknown> = {} as Record<PromptConfigKey, unknown>
    for (const name of PROMPT_CONFIG_KEYS) disk[name] = readPromptConfigFileFromDisk(name)
    cachedConfig = mergePromptConfigFiles(disk)
    cachedMaxUpdatedAt = maxUpdatedAt
    return cachedConfig
  }
}

export function updatePromptConfigFile(nameRaw: string, configJsonText: string): PromptConfigFileRow {
  const name = PromptConfigKeySchema.parse(nameRaw)
  let nextRaw: unknown
  try {
    nextRaw = JSON.parse(configJsonText) as unknown
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid JSON"
    throw new Error(message)
  }
  const nextParsed = stripGlobalPromptKeys(PromptConfigFileSchema.parse(nextRaw))

  const existing = loadPromptConfigFilesFromDb()
  existing[name] = nextParsed
  mergePromptConfigFiles(existing)

  const database = getDb()
  database
    .prepare(
      `INSERT INTO prompt_configs (name, config_json, updated_at)
       VALUES (?, ?, ${nowSql()})
       ON CONFLICT(name) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
    )
    .run(name, JSON.stringify(nextParsed))

  cachedConfig = null
  cachedMaxUpdatedAt = ""

  const row = database.prepare("SELECT name, config_json, updated_at FROM prompt_configs WHERE name = ?").get(name) as
    | PromptConfigFileRow
    | undefined
  if (!row) {
    throw new Error("Failed to save prompt config")
  }
  return row
}

export function resetPromptConfigFile(nameRaw: string): PromptConfigFileRow {
  const name = PromptConfigKeySchema.parse(nameRaw)
  const raw = readPromptConfigFileFromDisk(name)
  const parsed = stripGlobalPromptKeys(PromptConfigFileSchema.parse(raw))
  const database = getDb()
  database
    .prepare(
      `INSERT INTO prompt_configs (name, config_json, updated_at)
       VALUES (?, ?, ${nowSql()})
       ON CONFLICT(name) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
    )
    .run(name, JSON.stringify(parsed))

  cachedConfig = null
  cachedMaxUpdatedAt = ""

  const row = database.prepare("SELECT name, config_json, updated_at FROM prompt_configs WHERE name = ?").get(name) as
    | PromptConfigFileRow
    | undefined
  if (!row) {
    throw new Error("Failed to reset prompt config")
  }
  return row
}

export function resetAllPromptConfigFiles(): number {
  const database = getDb()
  const tx = database.transaction(() => {
    const disk: Record<PromptConfigKey, unknown> = {} as Record<PromptConfigKey, unknown>
    for (const name of PROMPT_CONFIG_KEYS) {
      const raw = readPromptConfigFileFromDisk(name)
      disk[name] = stripGlobalPromptKeys(PromptConfigFileSchema.parse(raw))
    }

    // Ensure the merged prompt config is valid before writing.
    mergePromptConfigFiles(disk)

    const upsert = database.prepare(
      `INSERT INTO prompt_configs (name, config_json, updated_at)
       VALUES (?, ?, ${nowSql()})
       ON CONFLICT(name) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
    )
    for (const name of PROMPT_CONFIG_KEYS) {
      upsert.run(name, JSON.stringify(disk[name]))
    }
    return PROMPT_CONFIG_KEYS.length
  })

  const count = tx()
  cachedConfig = null
  cachedMaxUpdatedAt = ""
  return count
}
