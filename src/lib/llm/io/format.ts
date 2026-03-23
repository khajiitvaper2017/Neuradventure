import type { MainCharacterState, WorldState } from "@/types/models"
import { getSectionFormat } from "@/llm/config"
import { getLlmStrings, getServerDefaults } from "@/utils/text/strings"

export type TurnHistoryEntry = {
  player_input: string
  narrative_text: string
  background_events?: string | null
}

function toTitleCase(tag: string): string {
  return tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function toPseudoXmlTagName(name: string): string {
  return name
    .trim()
    .replace(/[\r\n\t]/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/[<>&]/g, "")
}

export function wrapNamedEntry(name: string, content: string): string {
  switch (getSectionFormat()) {
    case "xml":
      // Note: this is "XML-like" markup for the LLM, not strict XML.
      // We allow spaces in tag names to match the user's preferred output.
      // Strip only the most dangerous tag-breaking characters.
      const tagName = toPseudoXmlTagName(name)
      return `<${tagName}>\n${content}\n</${tagName}>`
    case "markdown":
      return `### ${name}\n${content}`
    case "bbcode":
      return `[${name}]\n${content}`
    case "colon":
      return `${name}:\n${content}`
    case "none":
      return `${name}\n${content}`
    case "equals":
    default:
      return `=== ${name.toUpperCase()} ===\n${content}`
  }
}

export function wrapSection(tag: string, content: string): string {
  switch (getSectionFormat()) {
    case "xml":
      return `<${tag}>\n${content}\n</${tag}>`
    case "markdown":
      return `## ${toTitleCase(tag)}\n${content}`
    case "bbcode":
      return `[${tag}]\n${content}\n[/${tag}]`
    case "colon":
      return `${toTitleCase(tag)}:\n${content}`
    case "none":
      return content
    case "equals":
    default:
      return `=== ${tag.toUpperCase().replace(/_/g, " ")} ===\n${content}`
  }
}

export function formatInventory(inventory: MainCharacterState["inventory"]): string {
  if (inventory.length === 0) return getServerDefaults().format.nothing
  return inventory.map((i) => `${i.name} (${i.description})`).join(", ")
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function escapeForInlineJson(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export function formatHistoryEntries(
  turns: TurnHistoryEntry[],
  options: { includeBackgroundEvents?: boolean } = {},
): string[] {
  if (turns.length === 0) return []
  const includeBackgroundEvents = options.includeBackgroundEvents === true
  const backgroundTag = includeBackgroundEvents ? getLlmStrings().sections.backgroundEvents : null
  return turns.map((t) => {
    let entry = `> ${t.player_input}\n\n${t.narrative_text}`
    if (includeBackgroundEvents) {
      const bg = typeof t.background_events === "string" ? t.background_events.trim() : ""
      if (bg) entry += `\n\n${wrapSection(backgroundTag ?? "background_events", bg)}`
    }
    return entry
  })
}

export function injectEntryAtDepth(entries: string[], entry: string, depth: number): string[] {
  const trimmed = entry.trim()
  if (!trimmed) return entries
  const insertDepth = Math.max(0, depth)
  const insertIndex = Math.max(0, entries.length - insertDepth)
  const result = [...entries]
  result.splice(insertIndex, 0, entry)
  return result
}

export function buildHistoryBlock(
  turns: TurnHistoryEntry[],
  world: WorldState,
  ctxLimit: number,
  baseTokens: number,
  options: { includeBackgroundEvents?: boolean } = {},
): { summary: string | null; entries: string[] } {
  const entries = formatHistoryEntries(turns, options)
  if (entries.length === 0) return { summary: null, entries: [] }

  let history = entries.join("\n\n")
  if (!ctxLimit || ctxLimit <= 0) return { summary: null, entries }
  if (baseTokens + estimateTokens(history) <= ctxLimit) return { summary: null, entries }

  const summaryContent = [
    "{",
    `  "current_location": "${escapeForInlineJson(world.current_location)}",`,
    `  "time_of_day": "${escapeForInlineJson(world.time_of_day)}"`,
    "}",
  ].join("\n")
  const summary = wrapSection(getLlmStrings().sections.compressedEarlierContext, summaryContent)

  const targetRemove = Math.floor(ctxLimit * 0.6)
  let removedTokens = 0
  const remaining = [...entries]
  while (remaining.length > 0 && removedTokens < targetRemove) {
    const removed = remaining.shift()
    if (!removed) break
    removedTokens += estimateTokens(removed) + 1
  }

  let combinedHistory = remaining.join("\n\n")
  if (baseTokens + estimateTokens([summary, combinedHistory].join("\n\n")) <= ctxLimit) {
    return { summary, entries: remaining }
  }

  while (
    remaining.length > 0 &&
    baseTokens + estimateTokens([summary, remaining.join("\n\n")].join("\n\n")) > ctxLimit
  ) {
    remaining.shift()
  }

  combinedHistory = remaining.join("\n\n")
  if (baseTokens + estimateTokens([summary, combinedHistory].join("\n\n")) <= ctxLimit) {
    return { summary, entries: remaining }
  }
  return { summary, entries: [] }
}
