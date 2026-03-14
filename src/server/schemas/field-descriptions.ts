import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { getSettings } from "../core/db.js"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_FIELDS_PATH = path.resolve(__dirname, "../../../shared/config/settings-fields.json")
const SCHEMA_FIELDS_PATH = path.resolve(__dirname, "../../../shared/config/schema-fields.json")

export let SETTINGS_FIELDS: Record<string, unknown> = {}
export let SCHEMA_FIELDS: Record<string, unknown> = {}

type LeafLookup = {
  byKey: Map<string, string>
  bySuffix: Map<string, string>
  ambiguous: Set<string>
  ambiguousSuffix: Set<string>
}

const DEFAULT_WATCH_DEBOUNCE_MS = 50
let leafLookup: LeafLookup = { byKey: new Map(), bySuffix: new Map(), ambiguous: new Set(), ambiguousSuffix: new Set() }
let reloadTimer: NodeJS.Timeout | null = null
let watchersStarted = false
const activeWatchers: fs.FSWatcher[] = []

function normalizeWrappedKey(raw: string): string {
  const trimmed = raw.trim()
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return trimmed.slice(1, -1).trim()
  }
  return trimmed
}

function getFieldByPath(pathKey: string, root: Record<string, unknown>): string | null {
  const exact = root[pathKey]
  if (typeof exact === "string") return exact
  const parts = pathKey.split(".")
  let current: unknown = root
  for (const part of parts) {
    if (!current || typeof current !== "object") return null
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === "string" ? current : null
}

type FlatEntry = { fullKey: string; value: string }

function flattenLeafEntries(root: Record<string, unknown>): FlatEntry[] {
  const out: FlatEntry[] = []
  const walk = (node: unknown, prefix: string) => {
    if (!node || typeof node !== "object") return
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const fullKey = prefix ? `${prefix}.${key}` : key
      if (value && typeof value === "object" && !Array.isArray(value)) {
        walk(value, fullKey)
        continue
      }
      if (typeof value === "string") out.push({ fullKey, value })
    }
  }
  walk(root, "")
  return out
}

function buildLeafLookup(schemaFields: Record<string, unknown>, settingsFields: Record<string, unknown>): LeafLookup {
  const byKey = new Map<string, string>()
  const ambiguous = new Set<string>()
  const bySuffix = new Map<string, string>()
  const ambiguousSuffix = new Set<string>()

  const entries = [...flattenLeafEntries(schemaFields), ...flattenLeafEntries(settingsFields)]

  for (const { fullKey, value } of entries) {
    const parts = fullKey.split(".").filter(Boolean)
    if (parts.length === 0) continue

    const leaf = parts[parts.length - 1]!
    if (!ambiguous.has(leaf)) {
      if (byKey.has(leaf)) {
        byKey.delete(leaf)
        ambiguous.add(leaf)
      } else {
        byKey.set(leaf, value)
      }
    }

    // Build a suffix lookup for dotted shortcuts like story.title or character.name.
    // We only accept suffixes that map to exactly one full key across schema+settings.
    for (let take = 2; take <= parts.length; take++) {
      const suffix = parts.slice(parts.length - take).join(".")
      if (ambiguousSuffix.has(suffix)) continue
      if (bySuffix.has(suffix)) {
        bySuffix.delete(suffix)
        ambiguousSuffix.add(suffix)
        continue
      }
      bySuffix.set(suffix, value)
    }
  }

  return { byKey, bySuffix, ambiguous, ambiguousSuffix }
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
  const debounceMs = (() => {
    try {
      return getSettings().timeouts.fieldWatchDebounceMs
    } catch {
      return DEFAULT_WATCH_DEBOUNCE_MS
    }
  })()
  reloadTimer = setTimeout(() => {
    reloadTimer = null
    tryReloadFields()
  }, debounceMs)
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
  const normalized = normalizeWrappedKey(key)
  if (!normalized) return null
  if (normalized.includes(".")) {
    const exact = getFieldByPath(normalized, SCHEMA_FIELDS) ?? getFieldByPath(normalized, SETTINGS_FIELDS)
    if (exact) return exact
    return leafLookup.bySuffix.get(normalized) ?? null
  }
  return leafLookup.byKey.get(normalized) ?? null
}

export function replaceFieldShortcuts(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (match, rawKey: string) => {
    const key = rawKey.trim()
    const resolved = resolveFieldShortcut(key)
    return resolved ?? match
  })
}
