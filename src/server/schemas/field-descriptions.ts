import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_FIELDS_PATH = path.resolve(__dirname, "../../../shared/config/settings-fields.json")
const SCHEMA_FIELDS_PATH = path.resolve(__dirname, "../../../shared/config/schema-fields.json")

export let SETTINGS_FIELDS: Record<string, unknown> = {}
export let SCHEMA_FIELDS: Record<string, unknown> = {}

type LeafLookup = {
  byKey: Map<string, string>
  ambiguous: Set<string>
}

const WATCH_DEBOUNCE_MS = 50
let leafLookup: LeafLookup = { byKey: new Map(), ambiguous: new Set() }
let reloadTimer: NodeJS.Timeout | null = null
let watchersStarted = false
const activeWatchers: fs.FSWatcher[] = []

function getFieldByPath(pathKey: string, root: Record<string, unknown>): string | null {
  const parts = pathKey.split(".")
  let current: unknown = root
  for (const part of parts) {
    if (!current || typeof current !== "object") return null
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === "string" ? current : null
}

function buildLeafLookup(schemaFields: Record<string, unknown>, settingsFields: Record<string, unknown>): LeafLookup {
  const byKey = new Map<string, string>()
  const ambiguous = new Set<string>()

  const walk = (node: unknown) => {
    if (!node || typeof node !== "object") return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if (value && typeof value === "object") {
        walk(value)
        continue
      }
      if (typeof value !== "string") continue
      if (ambiguous.has(key)) continue
      if (byKey.has(key)) {
        byKey.delete(key)
        ambiguous.add(key)
        continue
      }
      byKey.set(key, value)
    }
  }

  walk(schemaFields)
  walk(settingsFields)
  return { byKey, ambiguous }
}

function readJsonFile(pathKey: string): Record<string, unknown> {
  return JSON.parse(fs.readFileSync(pathKey, "utf-8")) as Record<string, unknown>
}

function loadFields(): void {
  const nextSettings = readJsonFile(SETTINGS_FIELDS_PATH)
  const nextSchema = readJsonFile(SCHEMA_FIELDS_PATH)
  SETTINGS_FIELDS = nextSettings
  SCHEMA_FIELDS = nextSchema
  leafLookup = buildLeafLookup(nextSchema, nextSettings)
}

function tryReloadFields(): void {
  try {
    loadFields()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.warn(`[field-descriptions] Failed to reload field files: ${message}`)
  }
}

function scheduleReload(): void {
  if (reloadTimer) clearTimeout(reloadTimer)
  reloadTimer = setTimeout(() => {
    reloadTimer = null
    tryReloadFields()
  }, WATCH_DEBOUNCE_MS)
}

function startWatchers(): void {
  if (watchersStarted) return
  watchersStarted = true
  const watch = (pathKey: string) => {
    try {
      const watcher = fs.watch(pathKey, { persistent: false }, scheduleReload)
      activeWatchers.push(watcher)
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.warn(`[field-descriptions] Failed to watch ${pathKey}: ${message}`)
    }
  }
  watch(SETTINGS_FIELDS_PATH)
  watch(SCHEMA_FIELDS_PATH)
}

loadFields()
startWatchers()

export function resolveFieldShortcut(key: string): string | null {
  if (!key) return null
  if (key.includes(".")) {
    return getFieldByPath(key, SCHEMA_FIELDS) ?? getFieldByPath(key, SETTINGS_FIELDS)
  }
  return leafLookup.byKey.get(key) ?? null
}

export function replaceFieldShortcuts(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (match, rawKey: string) => {
    const key = rawKey.trim()
    const resolved = resolveFieldShortcut(key)
    return resolved ?? match
  })
}
