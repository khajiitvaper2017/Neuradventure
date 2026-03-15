import SETTINGS_FIELDS from "../../../../shared/config/settings-fields.json"
import SCHEMA_FIELDS from "../../../../shared/config/schema-fields.json"

type LeafLookup = {
  byKey: Map<string, string>
  bySuffix: Map<string, string>
  ambiguous: Set<string>
  ambiguousSuffix: Set<string>
}

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

const SETTINGS = SETTINGS_FIELDS as unknown as Record<string, unknown>
const SCHEMA = SCHEMA_FIELDS as unknown as Record<string, unknown>
const leafLookup = buildLeafLookup(SCHEMA, SETTINGS)

export function resolveFieldShortcut(key: string): string | null {
  if (!key) return null
  const normalized = normalizeWrappedKey(key)
  if (!normalized) return null
  if (normalized.includes(".")) {
    const exact = getFieldByPath(normalized, SCHEMA) ?? getFieldByPath(normalized, SETTINGS)
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
