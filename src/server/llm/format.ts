import type { MainCharacterState, NPCState, WorldState } from "../models.js"
import type { TurnRow } from "../db.js"
import { getSectionFormat } from "./config.js"

function toTitleCase(tag: string): string {
  return tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

export function wrapSection(tag: string, content: string): string {
  switch (getSectionFormat()) {
    case "xml":
      return `<${tag}>\n${content}\n</${tag}>`
    case "markdown":
      return `## ${toTitleCase(tag)}\n${content}`
    case "equals":
    default:
      return `=== ${tag.toUpperCase().replace(/_/g, " ")} ===\n${content}`
  }
}

export function formatInventory(inventory: MainCharacterState["inventory"]): string {
  if (inventory.length === 0) return "nothing"
  return inventory.map((i) => `${i.name} (${i.description})`).join(", ")
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function escapeForInlineJson(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

export function formatNPCBaselines(npcs: NPCState[]): string {
  if (npcs.length === 0) return ""
  return npcs
    .map(
      (npc) =>
        `[${npc.name}]\n` +
        `  Race: ${npc.race}\n` +
        (npc.gender ? `  Gender: ${npc.gender}\n` : "") +
        `  Baseline appearance: ${npc.appearance.baseline_appearance}\n` +
        `  Personality traits: ${npc.personality_traits.join(", ")}\n` +
        `  Major flaws: ${npc.major_flaws.join(", ") || "none"}\n` +
        `  Quirks: ${npc.quirks.join(", ") || "none"}\n` +
        `  Perks: ${npc.perks.join(", ") || "none"}`,
    )
    .join("\n\n")
}

export function formatNPCCurrentStates(npcs: NPCState[]): string {
  if (npcs.length === 0) return ""
  return npcs
    .map(
      (npc) =>
        `[${npc.name}]\n` +
        `  Current appearance: ${npc.appearance.current_appearance}\n` +
        `  Wearing: ${npc.appearance.current_clothing}\n` +
        `  Current activity: ${npc.current_activity}\n` +
        `  Location: ${npc.current_location}`,
    )
    .join("\n\n")
}

export function formatLocations(locations: WorldState["locations"]): string {
  if (!locations || locations.length === 0) return ""
  return locations
    .map((location) => {
      const characters = location.characters.length > 0 ? location.characters.join(", ") : "none"
      const items =
        location.available_items.length > 0
          ? location.available_items.map((item) => `${item.name} (${item.description})`).join(", ")
          : "none"
      return (
        `[${location.name}]\n` +
        `  Description: ${location.description}\n` +
        `  Characters: ${characters}\n` +
        `  Items: ${items}`
      )
    })
    .join("\n\n")
}

export function formatHistoryEntries(turns: TurnRow[]): string[] {
  if (turns.length === 0) return []
  return turns.map((t) => `> ${t.player_input}\n\n${t.narrative_text}`)
}

export function injectAuthorNote(
  entries: string[],
  authorNote: { text: string; depth: number } | null | undefined,
): string[] {
  if (!authorNote || !authorNote.text.trim()) return entries
  const note = `[Author's Note: ${authorNote.text.trim()}]`
  const depth = Math.max(0, authorNote.depth)
  const insertIndex = Math.max(0, entries.length - depth)
  const result = [...entries]
  result.splice(insertIndex, 0, note)
  return result
}

export function buildHistoryBlock(
  turns: TurnRow[],
  world: WorldState,
  ctxLimit: number,
  baseTokens: number,
  authorNote?: { text: string; depth: number } | null,
): { summary: string | null; history: string | null } {
  const rawEntries = formatHistoryEntries(turns)
  const entries = injectAuthorNote(rawEntries, authorNote)
  if (entries.length === 0) return { summary: null, history: null }

  let history = entries.join("\n\n")
  if (!ctxLimit || ctxLimit <= 0) return { summary: null, history }
  if (baseTokens + estimateTokens(history) <= ctxLimit) return { summary: null, history }

  const summaryContent = [
    "{",
    `  "current_scene": "${escapeForInlineJson(world.current_scene)}",`,
    `  "current_date": "${escapeForInlineJson(world.current_date)}",`,
    `  "time_of_day": "${escapeForInlineJson(world.time_of_day)}",`,
    `  "memory": "${escapeForInlineJson(world.memory)}"`,
    "}",
  ].join("\n")
  const summary = wrapSection("compressed_earlier_context", summaryContent)

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
    return { summary, history: combinedHistory || null }
  }

  while (
    remaining.length > 0 &&
    baseTokens + estimateTokens([summary, remaining.join("\n\n")].join("\n\n")) > ctxLimit
  ) {
    remaining.shift()
  }

  combinedHistory = remaining.join("\n\n")
  if (baseTokens + estimateTokens([summary, combinedHistory].join("\n\n")) <= ctxLimit) {
    return { summary, history: combinedHistory || null }
  }
  return { summary, history: null }
}
