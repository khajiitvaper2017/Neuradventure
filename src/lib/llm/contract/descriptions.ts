import PROMPT_FIELDS from "@/config/prompt-fields.json"
import { getFieldPromptOverridesMaxUpdatedAt, getFieldPromptOverridesRow } from "@/db/core"
import { isEngineDbInitialized } from "@/db/connection"

const DEFAULT_FIELD_DESCRIPTIONS = PROMPT_FIELDS as Record<string, string>
export const CHAT_FIELD_PREFIXES = ["generation.chat.", "chat."] as const

type CachedDescriptions = {
  version: string
  values: Record<string, string>
}

let cachedDescriptions: CachedDescriptions | null = null

function normalizeKey(key: string): string {
  return String(key ?? "").trim()
}

export function getFieldDescriptionMap(): Record<string, string> {
  return { ...DEFAULT_FIELD_DESCRIPTIONS }
}

export function listFieldKeysWithPrefixes(
  fieldDescriptions: Record<string, string>,
  prefixes: readonly string[],
): string[] {
  return Object.keys(fieldDescriptions)
    .filter((key) => prefixes.some((prefix) => key.startsWith(prefix)))
    .sort((a, b) => a.localeCompare(b))
}

export function listFieldKeysExcluding(
  fieldDescriptions: Record<string, string>,
  excludedKeys: readonly string[],
): string[] {
  const excluded = new Set(excludedKeys.map(normalizeKey).filter(Boolean))
  return Object.keys(fieldDescriptions)
    .filter((key) => !excluded.has(key))
    .sort((a, b) => a.localeCompare(b))
}

export function getEffectiveFieldDescriptionMap(): Record<string, string> {
  if (!isEngineDbInitialized()) {
    return { ...DEFAULT_FIELD_DESCRIPTIONS }
  }

  const version = getFieldPromptOverridesMaxUpdatedAt()
  if (cachedDescriptions && cachedDescriptions.version === version) {
    return { ...cachedDescriptions.values }
  }

  const overrides = getFieldPromptOverridesRow().overrides
  const merged = { ...DEFAULT_FIELD_DESCRIPTIONS }
  for (const [rawKey, rawValue] of Object.entries(overrides)) {
    const key = normalizeKey(rawKey)
    const value = String(rawValue ?? "").trim()
    if (!key || !value) continue
    if (!(key in DEFAULT_FIELD_DESCRIPTIONS)) continue
    merged[key] = value
  }

  cachedDescriptions = { version, values: merged }
  return { ...merged }
}

export function getFieldDescription(key: string): string {
  const normalized = normalizeKey(key)
  const description = getEffectiveFieldDescriptionMap()[normalized]
  if (description && description.trim()) return description.trim()
  throw new Error(`[llm-contract] Missing exact field description for "${normalized}"`)
}
