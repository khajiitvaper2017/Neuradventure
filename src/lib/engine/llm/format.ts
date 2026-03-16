import type { MainCharacterState, NPCState, WorldState } from "@/engine/core/models"
import type { TurnRow } from "@/engine/core/db"
import { getSectionFormat } from "@/engine/llm/config"
import { formatTemplate, getLlmStrings, getServerDefaults } from "@/engine/core/strings"
import type { ModuleFlags } from "@/engine/schemas/story-modules"
import type { CustomFieldDef } from "@/shared/api-types"

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

function wrapNamedEntry(name: string, content: string): string {
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

function customFieldValueLabel(value: string | string[]): string {
  if (Array.isArray(value)) return value.join(", ")
  return value
}

function formatNpcCustomFields(npc: NPCState, defs: CustomFieldDef[], placement: "base" | "current"): string[] {
  if (!npc.custom_fields) return []
  const lines: string[] = []
  for (const def of defs) {
    if (!def.enabled || def.scope !== "character") continue
    if (def.placement !== placement) continue
    const value = npc.custom_fields[def.id]
    if (value === undefined) continue
    const label = customFieldValueLabel(value)
    if (!label.trim()) continue
    lines.push(`  ${def.label} (${def.id}): ${label}`)
  }
  return lines
}

export function formatNPCBaselines(
  npcs: NPCState[],
  flags: ModuleFlags,
  customFieldDefs: CustomFieldDef[] = [],
): string {
  if (npcs.length === 0) return ""
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const labels = llmStrings.contextLabels
  const none = defaults.format.noneLower
  const useGeneral = !flags.useNpcAppearance
  return npcs
    .map((npc) => {
      const custom = customFieldDefs.length > 0 ? formatNpcCustomFields(npc, customFieldDefs, "base") : []
      const content =
        `  ${formatTemplate(labels.race, { value: npc.race })}\n` +
        (npc.gender ? `  ${formatTemplate(labels.gender, { value: npc.gender })}\n` : "") +
        (useGeneral
          ? `  ${formatTemplate(labels.generalDescription, {
              value: npc.general_description?.trim() || defaults.unknown.generalDescription,
            })}`
          : `  ${formatTemplate(labels.baselineAppearance, { value: npc.baseline_appearance })}`) +
        (flags.useNpcPersonalityTraits
          ? `\n  ${formatTemplate(labels.personalityTraits, { value: npc.personality_traits.join(", ") || none })}`
          : "") +
        (flags.useNpcMajorFlaws
          ? `\n  ${formatTemplate(labels.majorFlaws, { value: npc.major_flaws.join(", ") || none })}`
          : "") +
        (flags.useNpcPerks ? `\n  ${formatTemplate(labels.perks, { value: npc.perks.join(", ") || none })}` : "") +
        (custom.length > 0 ? `\n${custom.join("\n")}` : "")

      return wrapNamedEntry(npc.name, content)
    })
    .join("\n\n")
}

export function formatNPCCurrentStates(
  npcs: NPCState[],
  flags: ModuleFlags,
  customFieldDefs: CustomFieldDef[] = [],
): string {
  if (npcs.length === 0) return ""
  const llmStrings = getLlmStrings()
  const labels = llmStrings.characterContextLabels
  const contextLabels = llmStrings.contextLabels
  const defaults = getServerDefaults()
  const useGeneral = !flags.useNpcAppearance
  return npcs
    .map((npc) => {
      const custom = customFieldDefs.length > 0 ? formatNpcCustomFields(npc, customFieldDefs, "current") : []
      const content =
        (useGeneral
          ? `  ${formatTemplate(labels.generalDescription, {
              value: npc.general_description?.trim() || defaults.unknown.generalDescription,
            })}\n`
          : `  ${formatTemplate(labels.currentAppearance, { value: npc.current_appearance })}\n` +
            `  ${formatTemplate(contextLabels.wearing, { value: npc.current_clothing })}\n`) +
        (flags.useNpcActivity ? `  ${formatTemplate(labels.currentActivity, { value: npc.current_activity })}\n` : "") +
        (flags.useNpcLocation ? `  ${formatTemplate(labels.location, { value: npc.current_location })}` : "") +
        (custom.length > 0 ? `\n${custom.join("\n")}` : "")

      return wrapNamedEntry(npc.name, content)
    })
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

export function formatHistoryEntries(turns: TurnRow[], options: { includeBackgroundEvents?: boolean } = {}): string[] {
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
  turns: TurnRow[],
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
    `  "current_scene": "${escapeForInlineJson(world.current_scene)}",`,
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
