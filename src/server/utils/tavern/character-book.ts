import type { CharacterBook, CharacterBookEntry } from "../converters/tavern/card.js"

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value : ""
}

function normalizeKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.map((k) => (typeof k === "string" ? k.trim() : "")).filter(Boolean)
}

function includesKey(haystack: string, needle: string, caseSensitive: boolean): boolean {
  if (!needle) return false
  if (caseSensitive) return haystack.includes(needle)
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

function anyKeyMatches(haystack: string, keys: string[], caseSensitive: boolean): boolean {
  for (const key of keys) {
    if (includesKey(haystack, key, caseSensitive)) return true
  }
  return false
}

function entryIdentity(entry: CharacterBookEntry, index: number): string {
  const id = (entry as { id?: unknown }).id
  return typeof id === "number" ? `id:${id}` : `idx:${index}`
}

function entryPriority(entry: CharacterBookEntry): number {
  if (entry.constant) return Number.POSITIVE_INFINITY
  const p = (entry as { priority?: unknown }).priority
  return typeof p === "number" && Number.isFinite(p) ? p : 0
}

function entryInsertionOrder(entry: CharacterBookEntry): number {
  return typeof entry.insertion_order === "number" && Number.isFinite(entry.insertion_order) ? entry.insertion_order : 0
}

function entryCaseSensitive(entry: CharacterBookEntry): boolean {
  return entry.case_sensitive === true
}

function entryPosition(entry: CharacterBookEntry): "before_char" | "after_char" {
  return entry.position === "after_char" ? "after_char" : "before_char"
}

function entryMatches(entry: CharacterBookEntry, haystack: string): boolean {
  if (!entry.enabled) return false
  if (entry.constant) return true

  const caseSensitive = entryCaseSensitive(entry)
  const keys = normalizeKeys(entry.keys)
  const selective = entry.selective === true
  if (!selective) return anyKeyMatches(haystack, keys, caseSensitive)

  const secondary = normalizeKeys(entry.secondary_keys)
  return anyKeyMatches(haystack, keys, caseSensitive) && anyKeyMatches(haystack, secondary, caseSensitive)
}

export type RenderedCharacterBook = {
  before_char: string | null
  after_char: string | null
}

export function renderCharacterBook(book: CharacterBook, scanText: string): RenderedCharacterBook {
  const safeScanText = normalizeText(scanText)
  const entries = Array.isArray(book.entries) ? book.entries : []
  const maxTokens = typeof book.token_budget === "number" && book.token_budget > 0 ? book.token_budget : 200
  const maxPasses = book.recursive_scanning ? 3 : 1

  const triggered = new Map<string, CharacterBookEntry & { __index: number }>()
  let corpus = safeScanText

  for (let pass = 0; pass < maxPasses; pass++) {
    let added = 0
    for (let index = 0; index < entries.length; index++) {
      const entry = entries[index]
      const ident = entryIdentity(entry, index)
      if (triggered.has(ident)) continue
      if (!entryMatches(entry, corpus)) continue
      triggered.set(ident, { ...entry, __index: index })
      const content = normalizeText(entry.content).trim()
      if (book.recursive_scanning && content) corpus += `\n${content}`
      added++
    }
    if (added === 0) break
  }

  const candidates = Array.from(triggered.values()).filter((entry) => normalizeText(entry.content).trim().length > 0)

  candidates.sort((a, b) => {
    const pr = entryPriority(b) - entryPriority(a)
    if (pr !== 0) return pr
    return entryInsertionOrder(a) - entryInsertionOrder(b)
  })

  const selected: Array<CharacterBookEntry & { __index: number }> = []
  let usedTokens = 0
  for (const entry of candidates) {
    const tokenCost = estimateTokens(normalizeText(entry.content))
    if (usedTokens + tokenCost > maxTokens) continue
    selected.push(entry)
    usedTokens += tokenCost
  }

  selected.sort((a, b) => entryInsertionOrder(a) - entryInsertionOrder(b))

  const formatEntry = (entry: CharacterBookEntry): string => {
    const name = (typeof entry.name === "string" && entry.name.trim()) || normalizeKeys(entry.keys)[0] || "Entry"
    return `[${name}]\n${normalizeText(entry.content).trim()}`
  }

  const before = selected
    .filter((e) => entryPosition(e) === "before_char")
    .map(formatEntry)
    .join("\n\n")
  const after = selected
    .filter((e) => entryPosition(e) === "after_char")
    .map(formatEntry)
    .join("\n\n")

  return {
    before_char: before.trim() ? before : null,
    after_char: after.trim() ? after : null,
  }
}
