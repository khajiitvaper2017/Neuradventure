import type { MainCharacterState, NPCState, StoryModules, WorldState } from "@/types/models"
import { getGenerationParams } from "@/llm/client"
import { getImpersonatePrompt, getNpcCreationPrompt, getSectionFormat, getSystemPrompt } from "@/llm/config"
import { buildLlmContract } from "@/llm/contract"
import {
  renderCharacterContextLine,
  renderWorldContextLine,
  type CharacterFieldId,
  type CompiledFieldDefinition,
  type WorldFieldId,
} from "@/llm/contract/fields"
import {
  buildHistoryBlock,
  injectEntryAtDepth,
  wrapNamedEntry,
  wrapSection,
  estimateTokens,
  type TurnHistoryEntry,
} from "@/llm/io/format"
import { formatTemplate, getLlmStrings } from "@/utils/text/strings"
import { DEFAULT_STORY_MODULES } from "@/domain/story/schemas/story-modules"
import { renderCharacterBook } from "@/utils/tavern/character-book"
import type { CharacterBook } from "@/utils/converters/tavern"
import type { ChatCompletionMessageParam } from "@/llm/openai-types"
import { LlmRole } from "@/types/roles"
import * as db from "@/db/core"
import type { CustomFieldDef } from "@/types/api"

// ─── Shared context block builder ─────────────────────────────────────────────

function authorNoteRoleName(role: number): LlmRole {
  if (role === 1) return LlmRole.User
  if (role === 2) return LlmRole.Assistant
  return LlmRole.System
}

function wrapAuthorNoteSection(tag: string, content: string, role: LlmRole): string {
  const format = getSectionFormat()
  const llmStrings = getLlmStrings()
  const roleUpper = role.toUpperCase()
  const roleTitle = `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`

  if (format === "xml") {
    return `<${tag} role="${role}">\n${content}\n</${tag}>`
  }

  if (format === "none") {
    return formatTemplate(llmStrings.authorNote.none, { role: roleUpper, content })
  }

  const wrapped = wrapSection(tag, content)
  if (format === "equals") {
    return wrapped.replace(/^=== (.+) ===/m, (_m, title: string) => `=== ${title} (${roleUpper}) ===`)
  }
  if (format === "markdown") {
    return wrapped.replace(/^## ([^\n]+)\n/, `## $1 (${roleTitle})\n`)
  }
  if (format === "colon") {
    return wrapped.replace(/^([^\n]+):\n/, `$1 (${roleUpper}):\n`)
  }
  if (format === "bbcode") {
    return wrapped.replace(/^\[([^\]]+)\]\n/, `[$1]\nRole: ${roleUpper}\n`)
  }

  return wrapped
}

export interface ContextBlockOpts {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
  recentTurns: TurnHistoryEntry[]
  ctxLimit: number
  initialCharacter?: MainCharacterState
  actionBlock?: string | null
  playerInput?: string | null
  authorNote?: {
    text: string
    depth: number
    position: number
    interval: number
    role: number
    embedState: boolean
    enabled: boolean
  } | null
  characterBook?: CharacterBook | null
  modules?: StoryModules
}

function formatCustomFieldValue(value: string | string[]): string {
  return Array.isArray(value) ? value.join(", ") : value
}

function renderCustomFieldLines(
  fields: CompiledFieldDefinition[],
  values: Record<string, string | string[]> | undefined,
  fieldDefsById: Map<string, CustomFieldDef>,
): string[] {
  if (!values) return []
  const lines: string[] = []
  for (const field of fields) {
    const value = values[field.id]
    if (value === undefined) continue
    const rendered = formatCustomFieldValue(value).trim()
    if (!rendered) continue
    const def = fieldDefsById.get(field.id)
    const label = def?.label?.trim() || field.id
    lines.push(`${label} (${field.id}): ${rendered}`)
  }
  return lines
}

function renderCharacterFieldLines(
  character: MainCharacterState | NPCState,
  builtInFields: CompiledFieldDefinition[],
  customFields: CompiledFieldDefinition[],
  fieldDefsById: Map<string, CustomFieldDef>,
): string[] {
  const builtInLines = builtInFields
    .map((field) => renderCharacterContextLine(field.id as CharacterFieldId, character))
    .filter((line): line is string => Boolean(line?.trim()))
  const customLines = renderCustomFieldLines(customFields, character.custom_fields, fieldDefsById)
  return [...builtInLines, ...customLines]
}

function renderWorldFieldLines(
  world: WorldState,
  builtInFields: CompiledFieldDefinition[],
  customFields: CompiledFieldDefinition[],
  fieldDefsById: Map<string, CustomFieldDef>,
): string[] {
  const builtInLines = builtInFields
    .map((field) => renderWorldContextLine(field.id as WorldFieldId, world))
    .filter((line): line is string => Boolean(line?.trim()))
  const customLines = renderCustomFieldLines(customFields, world.custom_fields, fieldDefsById)
  return [...builtInLines, ...customLines]
}

function renderNamedCharacterSection(
  characters: NPCState[],
  builtInFields: CompiledFieldDefinition[],
  customFields: CompiledFieldDefinition[],
  fieldDefsById: Map<string, CustomFieldDef>,
): string {
  return characters
    .map((character) => {
      const lines = renderCharacterFieldLines(character, builtInFields, customFields, fieldDefsById)
      const content = lines.map((line) => `  ${line}`).join("\n")
      return wrapNamedEntry(character.name, content)
    })
    .join("\n\n")
}

function buildContextBlock(opts: ContextBlockOpts): string {
  const {
    character,
    world,
    npcs,
    recentTurns,
    ctxLimit,
    initialCharacter,
    actionBlock,
    authorNote,
    characterBook,
    playerInput,
  } = opts
  const initial = initialCharacter ?? character
  const llmStrings = getLlmStrings()
  const sections = llmStrings.sections
  const modules: StoryModules = opts.modules ?? DEFAULT_STORY_MODULES
  const customFieldDefs = db.listCustomFields().filter((d) => d.enabled)
  const contract = buildLlmContract("turn", {
    modules,
    customFieldDefs,
    playerName: character.name,
    knownNpcNames: npcs.map((npc) => npc.name),
  })
  const fieldDefsById = new Map(customFieldDefs.map((def) => [def.id, def]))

  const baseLines = renderCharacterFieldLines(
    { ...character, baseline_appearance: initial.baseline_appearance },
    contract.fieldSet.player.base,
    contract.fieldSet.player.customBase,
    fieldDefsById,
  ).join("\n")

  const baseSection = wrapSection(sections.playerCharacterBase, baseLines)

  let beforeCharacterBookSection: string | null = null
  let afterCharacterBookSection: string | null = null
  if (characterBook && Array.isArray(characterBook.entries) && characterBook.entries.length > 0) {
    const scanDepth =
      typeof characterBook.scan_depth === "number" && characterBook.scan_depth > 0
        ? Math.min(characterBook.scan_depth, recentTurns.length)
        : recentTurns.length
    const scanTurns = scanDepth > 0 ? recentTurns.slice(-scanDepth) : []
    const scanText = [scanTurns.map((t) => `${t.player_input}\n${t.narrative_text}`).join("\n\n"), actionBlock ?? ""]
      .filter(Boolean)
      .join("\n\n")
    const rendered = renderCharacterBook(characterBook, scanText)
    const beforeTag = (sections as Record<string, string>).characterBookBeforeChar ?? "character_book_before_char"
    const afterTag = (sections as Record<string, string>).characterBookAfterChar ?? "character_book_after_char"
    beforeCharacterBookSection = rendered.before_char ? wrapSection(beforeTag, rendered.before_char) : null
    afterCharacterBookSection = rendered.after_char ? wrapSection(afterTag, rendered.after_char) : null
  }

  const npcBaselineSection =
    modules.track_npcs && npcs.length > 0
      ? wrapSection(
          sections.npcBaselines,
          renderNamedCharacterSection(
            npcs,
            contract.fieldSet.npc.base,
            contract.fieldSet.npc.customBase,
            fieldDefsById,
          ),
        )
      : null

  // ── VOLATILE ──
  const currentSection = wrapSection(
    sections.playerCharacterState,
    renderCharacterFieldLines(
      character,
      contract.fieldSet.player.current,
      contract.fieldSet.player.customCurrent,
      fieldDefsById,
    ).join("\n"),
  )

  const npcCurrentSection =
    modules.track_npcs && npcs.length > 0
      ? wrapSection(
          sections.npcCurrentStates,
          renderNamedCharacterSection(
            npcs,
            contract.fieldSet.npc.current,
            contract.fieldSet.npc.customCurrent,
            fieldDefsById,
          ),
        )
      : null

  const storyContextSection = wrapSection(
    sections.storyContext,
    renderWorldFieldLines(
      world,
      contract.fieldSet.world.context,
      contract.fieldSet.world.customContext,
      fieldDefsById,
    ).join("\n"),
  )

  const joinSections = (sections: Array<string | null | undefined>): string => sections.filter(Boolean).join("\n\n")

  const storyHeader = wrapSection(sections.storySoFar, "").replace(/\n$/, "")
  const afterHistory = joinSections([actionBlock])

  const stableBlock = joinSections([
    beforeCharacterBookSection,
    baseSection,
    afterCharacterBookSection,
    npcBaselineSection,
  ])

  const volatileBlock = joinSections([currentSection, npcCurrentSection, storyContextSection])

  const noteTextRaw = typeof authorNote?.text === "string" ? authorNote.text : ""
  const noteText = noteTextRaw.trim()
  const noteDepth = Math.max(0, authorNote?.depth ?? 0)
  const notePosition = Math.max(0, Math.min(2, Math.floor(authorNote?.position ?? 1)))
  const noteInterval = Math.max(0, Math.floor(authorNote?.interval ?? 1))
  const noteRole = Math.max(0, Math.min(2, Math.floor(authorNote?.role ?? 0)))
  const noteEmbedState = authorNote?.embedState === true
  const noteEnabled = authorNote?.enabled === true

  const playerInputRaw = (playerInput ?? "").trim()
  const hasCurrentUserMessage = playerInputRaw.length > 0
  const isContinue = !hasCurrentUserMessage
  const priorUserMessageCount = recentTurns.filter((t) => t.player_input.trim().length > 0).length
  const userMessageCount = priorUserMessageCount + (hasCurrentUserMessage ? 1 : 0)

  const shouldInjectNoteText =
    noteEnabled &&
    noteText.length > 0 &&
    noteInterval > 0 &&
    (noteInterval === 1 || (noteInterval > 1 && userMessageCount % noteInterval === 0))

  const authorNoteContent = joinSections([
    noteEmbedState ? volatileBlock : null,
    shouldInjectNoteText ? noteText : null,
  ])
  const authorNoteSection =
    authorNoteContent.trim().length > 0
      ? wrapAuthorNoteSection(sections.authorNote, authorNoteContent, authorNoteRoleName(noteRole))
      : null
  const authorNoteTokens = authorNoteSection ? estimateTokens(authorNoteSection) : 0

  const volatileOutside = noteEmbedState ? null : volatileBlock
  const baseTokens =
    estimateTokens(joinSections([stableBlock, volatileOutside, storyHeader, afterHistory])) + authorNoteTokens
  const { summary, entries } = buildHistoryBlock(recentTurns, world, ctxLimit, baseTokens, {
    includeBackgroundEvents: modules.track_background_events,
  })

  const storySoFarHeader = entries.length > 0 ? storyHeader : null

  if (notePosition === 1) {
    let chatEntries = [...entries, ...(actionBlock ? [actionBlock] : [])]
    if (authorNoteSection) {
      const effectiveDepth = isContinue && noteDepth === 0 ? 1 : noteDepth
      chatEntries = injectEntryAtDepth(chatEntries, authorNoteSection, effectiveDepth)
    }
    const chatBlock = chatEntries.length > 0 ? chatEntries.join("\n\n") : null
    return joinSections([stableBlock, volatileOutside, summary || null, storySoFarHeader, chatBlock])
  }

  const beforeScenarioNote = notePosition === 2 ? authorNoteSection : null
  const afterScenarioNote = notePosition === 0 ? authorNoteSection : null
  const history = entries.length > 0 ? entries.join("\n\n") : null

  return joinSections([
    beforeScenarioNote,
    stableBlock,
    volatileOutside,
    afterScenarioNote,
    summary || null,
    storySoFarHeader,
    history,
    afterHistory || null,
  ])
}

// ─── Message builders (thin wrappers over buildContextBlock) ──────────────────

export function buildTurnMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnHistoryEntry[],
  playerInput: string,
  actionMode: string,
  initialCharacter?: MainCharacterState,
  ctxLimitOverride?: number,
  authorNote?: {
    text: string
    depth: number
    position: number
    interval: number
    role: number
    embedState: boolean
    enabled: boolean
  } | null,
  modules?: StoryModules,
  characterBook?: CharacterBook | null,
): ChatCompletionMessageParam[] {
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit
  const hasPlayerInput = playerInput.trim().length > 0
  const llmStrings = getLlmStrings()
  const sections = llmStrings.sections
  const actionSection = hasPlayerInput
    ? wrapSection(
        sections.playersAction,
        actionMode === "say" ? `${llmStrings.playerSayPrefix}${playerInput}` : playerInput,
      )
    : null

  const contextBlock = buildContextBlock({
    character,
    world,
    npcs,
    recentTurns,
    ctxLimit,
    initialCharacter,
    actionBlock: actionSection,
    playerInput,
    authorNote,
    characterBook,
    modules,
  })

  return [
    { role: LlmRole.System, content: getSystemPrompt(modules) },
    { role: LlmRole.User, content: contextBlock },
  ]
}

export function buildNpcCreationMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnHistoryEntry[],
  npcName: string,
  ctxLimitOverride?: number,
  authorNote?: {
    text: string
    depth: number
    position: number
    interval: number
    role: number
    embedState: boolean
    enabled: boolean
  } | null,
  modules?: StoryModules,
  characterBook?: CharacterBook | null,
): ChatCompletionMessageParam[] {
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit
  const sections = getLlmStrings().sections
  const actionBlock =
    npcName.trim().length > 0
      ? wrapSection(sections.introduceNewNpc, npcName)
      : wrapSection(sections.introduceNewNpc, "")

  const contextBlock = buildContextBlock({
    character,
    world,
    npcs,
    recentTurns,
    ctxLimit,
    actionBlock,
    playerInput: "",
    authorNote,
    characterBook,
    modules,
  })

  return [
    { role: LlmRole.System, content: getNpcCreationPrompt(modules) },
    { role: LlmRole.User, content: contextBlock },
  ]
}

export function buildImpersonateMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnHistoryEntry[],
  actionMode: string,
  initialCharacter?: MainCharacterState,
  ctxLimitOverride?: number,
  authorNote?: {
    text: string
    depth: number
    position: number
    interval: number
    role: number
    embedState: boolean
    enabled: boolean
  } | null,
  modules?: StoryModules,
  characterBook?: CharacterBook | null,
): ChatCompletionMessageParam[] {
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit
  const llmStrings = getLlmStrings()
  const sections = llmStrings.sections
  const hints = llmStrings.actionModeHints
  const actionModeHint = actionMode === "say" ? hints.say : actionMode === "story" ? hints.story : hints.do
  const actionModeSection = wrapSection(sections.actionMode, `${actionMode}\n${actionModeHint}`)

  const contextBlock = buildContextBlock({
    character,
    world,
    npcs,
    recentTurns,
    ctxLimit,
    initialCharacter,
    actionBlock: actionModeSection,
    playerInput: "",
    authorNote,
    characterBook,
    modules,
  })
  const prompt = `${contextBlock}\n\n${wrapSection(sections.playersAction, "")}`

  return [
    { role: LlmRole.System, content: getImpersonatePrompt(modules) },
    { role: LlmRole.User, content: prompt },
  ]
}
