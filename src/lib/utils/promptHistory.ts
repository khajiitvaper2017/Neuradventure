import { promptHistory, type PromptHistoryKind } from "@/services/promptHistory"

const MAX_HISTORY = 12

function normalizePrompt(prompt: string): string {
  return prompt.trim()
}

function kindFromKey(key: string): PromptHistoryKind | null {
  const parts = key.split(":")
  const last = parts[parts.length - 1]?.trim()
  if (last === "story" || last === "character" || last === "chat") return last
  return null
}

function loadLegacyLocalStorage(key: string): string[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(key)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((entry) => (typeof entry === "string" ? entry.trim() : "")).filter(Boolean)
  } catch {
    return []
  }
}

function clearLegacyLocalStorage(key: string): void {
  if (typeof window === "undefined") return
  try {
    window.localStorage.removeItem(key)
  } catch {
    // ignore
  }
}

export async function loadPromptHistory(key: string, max = MAX_HISTORY): Promise<string[]> {
  const kind = kindFromKey(key)
  if (!kind) return []
  try {
    const items = await promptHistory.list(kind, max)
    if (items.length > 0) return items

    // One-time migration from legacy localStorage.
    const legacy = loadLegacyLocalStorage(key)
    if (legacy.length === 0) return items
    const migrated = await promptHistory.bulkAdd(kind, legacy.slice(0, max), max)
    clearLegacyLocalStorage(key)
    return migrated
  } catch {
    // If API is unavailable, fall back to legacy localStorage for now.
    return loadLegacyLocalStorage(key).slice(0, max)
  }
}

export async function savePromptHistory(key: string, prompt: string, max = MAX_HISTORY): Promise<string[]> {
  const kind = kindFromKey(key)
  if (!kind) return []
  const normalized = normalizePrompt(prompt)
  if (!normalized) return loadPromptHistory(key, max)
  try {
    return await promptHistory.add(kind, normalized, max)
  } catch {
    // fallback to localStorage behavior if server is offline
    const legacy = loadLegacyLocalStorage(key).filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())
    const next = [normalized, ...legacy].slice(0, max)
    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // ignore
    }
    return next
  }
}

export async function removePromptHistory(key: string, prompt: string, max = MAX_HISTORY): Promise<string[]> {
  const kind = kindFromKey(key)
  if (!kind) return []
  const normalized = normalizePrompt(prompt)
  if (!normalized) return loadPromptHistory(key, max)
  try {
    return await promptHistory.remove(kind, normalized, max)
  } catch {
    const legacy = loadLegacyLocalStorage(key).filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())
    const next = legacy.slice(0, max)
    try {
      window.localStorage.setItem(key, JSON.stringify(next))
    } catch {
      // ignore
    }
    return next
  }
}
