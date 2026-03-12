import type { MainCharacterState, NPCState, WorldState } from "../core/models.js"
import type { TurnRow } from "../core/db.js"
import { getSectionFormat } from "./config.js"
import { formatTemplate, getLlmStrings, getServerDefaults } from "../core/strings.js"

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
  if (inventory.length === 0) return getServerDefaults().format.nothing
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
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const labels = llmStrings.contextLabels
  const none = defaults.format.noneLower
  return npcs
    .map(
      (npc) =>
        `[${npc.name}]\n` +
        `  ${formatTemplate(labels.race, { value: npc.race })}\n` +
        (npc.gender ? `  ${formatTemplate(labels.gender, { value: npc.gender })}\n` : "") +
        `  ${formatTemplate(labels.baselineAppearance, { value: npc.appearance.baseline_appearance })}\n` +
        `  ${formatTemplate(labels.personalityTraits, { value: npc.personality_traits.join(", ") })}\n` +
        `  ${formatTemplate(labels.majorFlaws, { value: npc.major_flaws.join(", ") || none })}\n` +
        `  ${formatTemplate(labels.quirks, { value: npc.quirks.join(", ") || none })}\n` +
        `  ${formatTemplate(labels.perks, { value: npc.perks.join(", ") || none })}`,
    )
    .join("\n\n")
}

export function formatNPCCurrentStates(npcs: NPCState[]): string {
  if (npcs.length === 0) return ""
  const llmStrings = getLlmStrings()
  const labels = llmStrings.characterContextLabels
  const contextLabels = llmStrings.contextLabels
  return npcs
    .map(
      (npc) =>
        `[${npc.name}]\n` +
        `  ${formatTemplate(labels.currentAppearance, { value: npc.appearance.current_appearance })}\n` +
        `  ${formatTemplate(contextLabels.wearing, { value: npc.appearance.current_clothing })}\n` +
        `  ${formatTemplate(labels.currentActivity, { value: npc.current_activity })}\n` +
        `  ${formatTemplate(labels.location, { value: npc.current_location })}`,
    )
    .join("\n\n")
}

export function formatLocations(locations: WorldState["locations"]): string {
  if (!locations || locations.length === 0) return ""
  const labels = getLlmStrings().contextLabels
  const none = getServerDefaults().format.noneLower
  return locations
    .map((location) => {
      const characters = location.characters.length > 0 ? location.characters.join(", ") : none
      const items =
        location.available_items.length > 0
          ? location.available_items.map((item) => `${item.name} (${item.description})`).join(", ")
          : none
      return (
        `[${location.name}]\n` +
        `  ${formatTemplate(labels.description, { value: location.description })}\n` +
        `  ${formatTemplate(labels.characters, { value: characters })}\n` +
        `  ${formatTemplate(labels.items, { value: items })}`
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
  const llmStrings = getLlmStrings()
  const note = formatTemplate(llmStrings.authorNote.wrapper, { note: authorNote.text.trim() })
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
