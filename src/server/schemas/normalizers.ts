import { DAY_NAMES, DEFAULT_RECENT_EVENTS_SUMMARY, TWO_TO_THREE_SENTENCES_REGEX } from "./constants.js"
import { npcTraitEnumValues, npcTraitLookup } from "./npc-traits.js"

export function normalizeDayOfWeek(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim().toLowerCase()
    const match = DAY_NAMES.find((day) => day.toLowerCase() === trimmed)
    if (match) return match
  }
  return "Monday"
}

export function normalizeTimeOfDay(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    const match = /^(\d{1,2}):(\d{2})$/.exec(trimmed)
    if (match) {
      const hour = Number(match[1])
      const minute = Number(match[2])
      if (
        Number.isInteger(hour) &&
        Number.isInteger(minute) &&
        hour >= 0 &&
        hour <= 23 &&
        minute >= 0 &&
        minute <= 59
      ) {
        return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`
      }
    }
  }
  return "00:00"
}

export function normalizeCurrentScene(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length > 0) {
      const words = trimmed.split(/\s+/).slice(0, 5)
      return words.join(" ")
    }
  }
  return "Unknown location"
}

export function stripSummaryLeak(value: string): string {
  let sanitized = value
  sanitized = sanitized.replace(/\/\*[\s\S]*?\*\//g, " ")
  sanitized = sanitized.replace(/<!--[\s\S]*?-->/g, " ")
  sanitized = sanitized.replace(/(^|[\s.!?])\/\/.*$/g, "$1")
  return sanitized.trim()
}

export function normalizeRecentEventsSummary(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = stripSummaryLeak(value).trim()
    if (trimmed.length > 0) {
      const matches = trimmed.match(/[^.!?]+[.!?]+/g) ?? []
      let sentences = matches.map((sentence) => sentence.trim()).filter(Boolean)
      if (sentences.length === 0) sentences = [trimmed]
      sentences = sentences.map((sentence) => (/[.!?]$/.test(sentence) ? sentence : `${sentence}.`))
      if (sentences.length === 1) sentences.push("Further details are unknown.")
      if (sentences.length > 3) sentences = sentences.slice(0, 3)
      const summary = sentences.join(" ").trim()
      if (TWO_TO_THREE_SENTENCES_REGEX.test(summary)) return summary
    }
  }
  return DEFAULT_RECENT_EVENTS_SUMMARY
}

export function normalizeNonEmptyString(value: unknown, fallback: string): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    if (trimmed.length > 0) return trimmed
  }
  return fallback
}

export function normalizePersonalityTraits(value: unknown): string[] {
  const traits: string[] = []
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") continue
      const trimmed = entry.trim()
      if (!trimmed) continue
      const canonical = npcTraitLookup.get(trimmed.toLowerCase()) ?? trimmed
      if (!traits.includes(canonical)) traits.push(canonical)
    }
  }

  if (traits.length < 2) {
    const fallbacks =
      npcTraitEnumValues.length >= 2
        ? [npcTraitEnumValues[0], npcTraitEnumValues[1]]
        : npcTraitEnumValues.length === 1
          ? [npcTraitEnumValues[0], npcTraitEnumValues[0]]
          : ["Curious", "Honest"]
    for (const fallback of fallbacks) {
      if (traits.length >= 2) break
      if (!traits.includes(fallback)) traits.push(fallback)
    }
  }

  return traits.slice(0, 5)
}

export function normalizeAppearance(value: unknown): { physical_description: string; current_clothing: string } {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    return {
      physical_description: normalizeNonEmptyString(obj.physical_description, "Unknown appearance"),
      current_clothing: normalizeNonEmptyString(obj.current_clothing, "Unknown clothing"),
    }
  }
  return {
    physical_description: "Unknown appearance",
    current_clothing: "Unknown clothing",
  }
}
