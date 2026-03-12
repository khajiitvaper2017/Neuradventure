import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SETTINGS_FIELDS_PATH = path.resolve(__dirname, "../../../shared/config/settings-fields.json")
const SCHEMA_FIELDS_PATH = path.resolve(__dirname, "../../../shared/config/schema-fields.json")

const rawSettings = fs.readFileSync(SETTINGS_FIELDS_PATH, "utf-8")
const rawSchema = fs.readFileSync(SCHEMA_FIELDS_PATH, "utf-8")
export const SETTINGS_FIELDS = JSON.parse(rawSettings) as Record<string, unknown>
export const SCHEMA_FIELDS = JSON.parse(rawSchema) as Record<string, unknown>

type LeafLookup = {
  byKey: Map<string, string>
  ambiguous: Set<string>
}

const leafLookup: LeafLookup = buildLeafLookup()

function getFieldByPath(pathKey: string, root: Record<string, unknown>): string | null {
  const parts = pathKey.split(".")
  let current: unknown = root
  for (const part of parts) {
    if (!current || typeof current !== "object") return null
    current = (current as Record<string, unknown>)[part]
  }
  return typeof current === "string" ? current : null
}

function buildLeafLookup(): LeafLookup {
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

  walk(SCHEMA_FIELDS)
  walk(SETTINGS_FIELDS)
  return { byKey, ambiguous }
}

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
