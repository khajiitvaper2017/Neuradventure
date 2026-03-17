import SETTINGS_FIELDS from "@/config/settings-fields.json"
import PROMPT_FIELDS from "@/config/prompt-fields.json"
import {
  getCustomFieldsMaxUpdatedAt,
  getFieldPromptOverridesMaxUpdatedAt,
  getFieldPromptOverridesRow,
  listCustomFields,
} from "@/db/core"

type LeafLookup = {
  byFullKey: Map<string, string>
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

function isWrappedReferenceValue(value: string): boolean {
  const trimmed = value.trim()
  return trimmed.startsWith("{") && trimmed.endsWith("}") && trimmed.length >= 3
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

function buildLeafLookup(entries: FlatEntry[]): LeafLookup {
  const byFullKey = new Map<string, string>()
  const byKey = new Map<string, string>()
  const ambiguous = new Set<string>()
  const bySuffix = new Map<string, string>()
  const ambiguousSuffix = new Set<string>()

  for (const { fullKey, value } of entries) {
    if (!fullKey) continue
    byFullKey.set(fullKey, value)
  }

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

  return { byFullKey, byKey, bySuffix, ambiguous, ambiguousSuffix }
}

const SETTINGS = SETTINGS_FIELDS as unknown as Record<string, unknown>
const SCHEMA = PROMPT_FIELDS as unknown as Record<string, unknown>

type CachedLookup = {
  version: string
  lookup: LeafLookup
}

let cachedLookup: CachedLookup | null = null

function buildDynamicEntries(): FlatEntry[] {
  const baseEntries = [...flattenLeafEntries(SCHEMA), ...flattenLeafEntries(SETTINGS)]

  const overrides = getFieldPromptOverridesRow().overrides
  const overrideEntries = Object.entries(overrides)
    .map(([fullKey, value]) => ({ fullKey, value }))
    .filter((e) => e.fullKey.trim().length > 0)

  const overrideMap = new Map<string, string>(overrideEntries.map((e) => [e.fullKey, e.value]))
  const mergedBase = baseEntries.map((e) =>
    overrideMap.has(e.fullKey) ? { ...e, value: overrideMap.get(e.fullKey)! } : e,
  )

  // Custom field prompts behave like built-in prompt-field leaves.
  const customDefs = listCustomFields()
  const customEntries: FlatEntry[] = []
  for (const def of customDefs) {
    const id = def.id.trim()
    if (!id) continue
    const prompt = String(def.prompt ?? "").trim()
    if (!prompt) continue
    if (def.scope === "character") {
      customEntries.push({ fullKey: `state.character.custom_fields.${id}`, value: prompt })
    } else if (def.scope === "world") {
      customEntries.push({ fullKey: `llm.world_state_update.custom_fields.${id}`, value: prompt })
    }
  }

  // Overrides that refer to keys not present in the built-ins should still resolve.
  const baseKeySet = new Set(mergedBase.map((e) => e.fullKey))
  const extraOverrideEntries = overrideEntries.filter((e) => !baseKeySet.has(e.fullKey))

  return [...mergedBase, ...extraOverrideEntries, ...customEntries]
}

function getLookup(): LeafLookup {
  const version = `${getFieldPromptOverridesMaxUpdatedAt()}|${getCustomFieldsMaxUpdatedAt()}`
  if (cachedLookup && cachedLookup.version === version) return cachedLookup.lookup
  const entries = buildDynamicEntries()
  const lookup = buildLeafLookup(entries)
  cachedLookup = { version, lookup }
  return lookup
}

function resolveFieldShortcutOnce(key: string): string | null {
  if (!key) return null
  const normalized = normalizeWrappedKey(key)
  if (!normalized) return null
  if (normalized.includes(".")) {
    const lookup = getLookup()
    const exact =
      lookup.byFullKey.get(normalized) ?? getFieldByPath(normalized, SCHEMA) ?? getFieldByPath(normalized, SETTINGS)
    if (exact) return exact
    return lookup.bySuffix.get(normalized) ?? null
  }
  return getLookup().byKey.get(normalized) ?? null
}

export function resolveFieldShortcut(key: string): string | null {
  let current = normalizeWrappedKey(key)
  if (!current) return null

  const seen = new Set<string>()
  for (let depth = 0; depth < 8; depth++) {
    if (seen.has(current)) return null
    seen.add(current)

    const resolved = resolveFieldShortcutOnce(current)
    if (!resolved) return null

    if (isWrappedReferenceValue(resolved)) {
      current = normalizeWrappedKey(resolved)
      if (!current) return null
      continue
    }

    return resolved
  }

  return null
}

export function replaceFieldShortcuts(text: string): string {
  return text.replace(/\{([^{}]+)\}/g, (match, rawKey: string) => {
    const key = rawKey.trim()
    const resolved = resolveFieldShortcut(key)
    return resolved ?? match
  })
}
