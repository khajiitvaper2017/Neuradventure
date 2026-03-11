const MAX_HISTORY = 12

function normalizePrompt(prompt: string): string {
  return prompt.trim()
}

export function loadPromptHistory(key: string): string[] {
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

export function savePromptHistory(key: string, prompt: string, max = MAX_HISTORY): string[] {
  if (typeof window === "undefined") return []
  const normalized = normalizePrompt(prompt)
  if (!normalized) return loadPromptHistory(key)
  const existing = loadPromptHistory(key).filter((entry) => entry.toLowerCase() !== normalized.toLowerCase())
  const next = [normalized, ...existing].slice(0, max)
  try {
    window.localStorage.setItem(key, JSON.stringify(next))
  } catch {
    // ignore storage failures
  }
  return next
}
