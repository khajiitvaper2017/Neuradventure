export type ActionMode = "do" | "say" | "story"

export function matchCase(match: string, replacement: string): string {
  if (match.toUpperCase() === match) return replacement.toUpperCase()
  if (match[0] === match[0].toUpperCase()) return replacement[0].toUpperCase() + replacement.substring(1)
  return replacement
}

export function normalizeDoInput(text: string): string {
  let normalized = text
  normalized = normalized.replace(/\bmyself\b/gi, (m) => matchCase(m, "yourself"))
  normalized = normalized.replace(/\bmy\b/gi, (m) => matchCase(m, "your"))
  if (!/^(you|your|yourself)\b/i.test(normalized)) {
    const lowered = normalized.replace(/^([A-Z])/, (m) => m.toLowerCase())
    normalized = `You ${lowered}`
  }
  return normalized
}

export function normalizeSayInput(text: string): string {
  if (text.startsWith('"') && text.endsWith('"') && text.length >= 2) return text
  return `"${text}"`
}

export function normalizePlayerInput(text: string, mode?: ActionMode): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  if (mode === "do") return normalizeDoInput(trimmed)
  if (mode === "say") return normalizeSayInput(trimmed)
  return trimmed
}

export function normalizeChatInput(text: string, mode: Exclude<ActionMode, "story">): string {
  const trimmed = text.trim()
  if (!trimmed) return trimmed
  if (mode === "do") return normalizeDoInput(trimmed)
  return normalizeSayInput(trimmed)
}
