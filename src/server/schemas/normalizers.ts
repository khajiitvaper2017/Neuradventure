import { DATE_REGEX, DEFAULT_RECENT_EVENTS_SUMMARY } from "./constants.js"
import { npcTraitEnumValues, npcTraitLookup } from "./npc-traits.js"

type NormalizedLocationItem = { name: string; description: string }
type NormalizedLocation = {
  name: string
  description: string
  characters: string[]
  available_items: NormalizedLocationItem[]
}

export function normalizeCurrentDate(value: unknown): string {
  if (typeof value === "string") {
    const trimmed = value.trim()
    const match = DATE_REGEX.exec(trimmed)
    if (match) {
      const year = Number(match[1])
      const month = Number(match[2])
      const day = Number(match[3])
      if (
        Number.isInteger(year) &&
        Number.isInteger(month) &&
        Number.isInteger(day) &&
        month >= 1 &&
        month <= 12 &&
        day >= 1 &&
        day <= 31
      ) {
        const utc = new Date(Date.UTC(year, month - 1, day))
        if (utc.getUTCFullYear() === year && utc.getUTCMonth() === month - 1 && utc.getUTCDate() === day) {
          return trimmed
        }
      }
    }
  }
  return new Date().toISOString().slice(0, 10)
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
      return summary
    }
  }
  return DEFAULT_RECENT_EVENTS_SUMMARY
}

export function normalizeMemory(value: unknown): string {
  return normalizeRecentEventsSummary(value)
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

export function normalizeTraitList(value: unknown, max = 6): string[] {
  const items: string[] = []
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") continue
      const trimmed = entry.trim()
      if (!trimmed) continue
      if (!items.includes(trimmed)) items.push(trimmed)
    }
  }
  return items.slice(0, max)
}

export function normalizeAppearance(value: unknown): {
  baseline_appearance: string
  current_appearance: string
  current_clothing: string
} {
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>
    const baseline = normalizeNonEmptyString(
      obj.baseline_appearance ?? obj.physical_description,
      "Unknown baseline appearance",
    )
    const current = normalizeNonEmptyString(
      obj.current_appearance ?? obj.physical_description ?? obj.baseline_appearance,
      baseline || "Unknown appearance",
    )
    return {
      baseline_appearance: baseline,
      current_appearance: current,
      current_clothing: normalizeNonEmptyString(obj.current_clothing, "Unknown clothing"),
    }
  }
  return {
    baseline_appearance: "Unknown baseline appearance",
    current_appearance: "Unknown appearance",
    current_clothing: "Unknown clothing",
  }
}

function normalizeStringList(value: unknown): string[] {
  const items: string[] = []
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (typeof entry !== "string") continue
      const trimmed = entry.trim()
      if (!trimmed) continue
      if (!items.includes(trimmed)) items.push(trimmed)
    }
  }
  return items
}

function normalizeLocationItems(value: unknown): NormalizedLocationItem[] {
  const items: NormalizedLocationItem[] = []
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue
      const obj = entry as Record<string, unknown>
      const name = normalizeNonEmptyString(obj.name, "")
      if (!name) continue
      const description = normalizeNonEmptyString(obj.description, "Unknown item")
      items.push({ name, description })
    }
  }
  return items
}

export function normalizeLocations(value: unknown, fallbackScene: string): NormalizedLocation[] {
  const locations: NormalizedLocation[] = []
  if (Array.isArray(value)) {
    for (const entry of value) {
      if (!entry || typeof entry !== "object") continue
      const obj = entry as Record<string, unknown>
      const name = normalizeNonEmptyString(obj.name, "")
      if (!name) continue
      const description = normalizeNonEmptyString(obj.description, "Unknown location details")
      const characters = normalizeStringList(obj.characters)
      const available_items = normalizeLocationItems(obj.available_items)
      locations.push({ name, description, characters, available_items })
    }
  }

  if (locations.length === 0) {
    const fallback = normalizeNonEmptyString(fallbackScene, "Unknown location")
    locations.push({
      name: fallback,
      description: "Unknown location details",
      characters: [],
      available_items: [],
    })
  }

  const fallbackName = normalizeNonEmptyString(fallbackScene, "")
  if (fallbackName) {
    const fallbackKey = fallbackName.trim().toLowerCase()
    const hasScene = locations.some((location) => location.name.trim().toLowerCase() === fallbackKey)
    if (!hasScene) {
      locations.push({
        name: fallbackName,
        description: "Unknown location details",
        characters: [],
        available_items: [],
      })
    }
  }

  const deduped: NormalizedLocation[] = []
  const seen = new Set<string>()
  for (const location of locations) {
    const key = location.name.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    deduped.push(location)
  }

  return deduped
}
