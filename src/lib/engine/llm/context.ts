import type { MainCharacterState, NPCState, StoryModules, WorldState } from "@/engine/core/models"
import type { TurnRow } from "@/engine/core/db"
import { getGenerationParams } from "@/engine/llm/client"
import { getImpersonatePrompt, getNpcCreationPrompt, getSectionFormat, getSystemPrompt } from "@/engine/llm/config"
import {
  buildHistoryBlock,
  formatInventory,
  formatLocations,
  formatNPCBaselines,
  formatNPCCurrentStates,
  injectEntryAtDepth,
  wrapSection,
  estimateTokens,
} from "@/engine/llm/format"
import { formatTemplate, getLlmStrings, getServerDefaults } from "@/engine/core/strings"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "@/engine/schemas/story-modules"
import { renderCharacterBook } from "@/engine/utils/tavern/character-book"
import type { CharacterBook } from "@/engine/utils/converters/tavern"
import type { ChatCompletionMessageParam } from "@/engine/llm/openai-types"

// ─── Shared context block builder ─────────────────────────────────────────────

function authorNoteRoleName(role: number): "system" | "user" | "assistant" {
  if (role === 1) return "user"
  if (role === 2) return "assistant"
  return "system"
}

function wrapAuthorNoteSection(tag: string, content: string, role: "system" | "user" | "assistant"): string {
  const format = getSectionFormat()
  const roleUpper = role.toUpperCase()
  const roleTitle = `${role.slice(0, 1).toUpperCase()}${role.slice(1)}`

  if (format === "xml") {
    return `<${tag} role="${role}">\n${content}\n</${tag}>`
  }

  if (format === "none") {
    return `Author note (${roleUpper}):\n${content}`
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
  recentTurns: TurnRow[]
  ctxLimit: number
  initialCharacter?: MainCharacterState
  actionBlock?: string | null
  memory?: string | null
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
  const defaults = getServerDefaults()
  const labels = llmStrings.contextLabels
  const sections = llmStrings.sections
  const none = defaults.format.noneLower
  const modules: StoryModules = opts.modules ?? DEFAULT_STORY_MODULES
  const flags = resolveModuleFlags(modules)
  const generalDescription = character.general_description?.trim() || defaults.unknown.generalDescription

  const baseLines = [
    formatTemplate(labels.nameRaceGender, {
      name: character.name,
      race: character.race,
      gender: character.gender,
    }),
    formatTemplate(labels.generalDescription, { value: generalDescription }),
    flags.useCharAppearance
      ? formatTemplate(labels.baselineAppearance, {
          value: initial.baseline_appearance?.trim() || defaults.unknown.baselineAppearance,
        })
      : null,
    flags.useCharPersonalityTraits
      ? formatTemplate(labels.personalityTraits, { value: character.personality_traits.join(", ") || none })
      : null,
    flags.useCharMajorFlaws
      ? formatTemplate(labels.majorFlaws, { value: character.major_flaws.join(", ") || none })
      : null,
    flags.useCharQuirks ? formatTemplate(labels.quirks, { value: character.quirks.join(", ") || none }) : null,
    flags.useCharPerks ? formatTemplate(labels.perks, { value: character.perks.join(", ") || none }) : null,
  ]
    .filter(Boolean)
    .join("\n")

  const baseSection = wrapSection(sections.playerCharacterBase, baseLines)

  let beforeCharacterBookSection: string | null = null
  let afterCharacterBookSection: string | null = null
  if (characterBook && Array.isArray(characterBook.entries) && characterBook.entries.length > 0) {
    const scanDepth =
      typeof characterBook.scan_depth === "number" && characterBook.scan_depth > 0
        ? Math.min(characterBook.scan_depth, recentTurns.length)
        : recentTurns.length
    const scanTurns = scanDepth > 0 ? recentTurns.slice(-scanDepth) : []
    const scanText = [
      world.memory,
      scanTurns.map((t) => `${t.player_input}\n${t.narrative_text}`).join("\n\n"),
      actionBlock ?? "",
    ]
      .filter(Boolean)
      .join("\n\n")
    const rendered = renderCharacterBook(characterBook, scanText)
    const beforeTag = (sections as Record<string, string>).characterBookBeforeChar ?? "character_book_before_char"
    const afterTag = (sections as Record<string, string>).characterBookAfterChar ?? "character_book_after_char"
    beforeCharacterBookSection = rendered.before_char ? wrapSection(beforeTag, rendered.before_char) : null
    afterCharacterBookSection = rendered.after_char ? wrapSection(afterTag, rendered.after_char) : null
  }

  const npcBaselineSection =
    modules.track_npcs && npcs.length > 0 ? wrapSection(sections.npcBaselines, formatNPCBaselines(npcs, flags)) : null

  const locationSection =
    modules.track_locations && world.locations && world.locations.length > 0
      ? wrapSection(sections.locations, formatLocations(world.locations))
      : null

  // ── SEMI-STABLE ──
  const memorySection = world.memory ? wrapSection(sections.memory, world.memory) : null

  // ── VOLATILE ──
  const currentSection = wrapSection(
    sections.playerCharacterState,
    [
      flags.useCharAppearance
        ? formatTemplate(labels.currentAppearance, { value: character.current_appearance })
        : null,
      flags.useCharAppearance ? formatTemplate(labels.wearing, { value: character.current_clothing }) : null,
      formatTemplate(labels.location, { value: character.current_location }),
      flags.useCharInventory ? formatTemplate(labels.inventory, { value: formatInventory(character.inventory) }) : null,
    ]
      .filter(Boolean)
      .join("\n"),
  )

  const npcCurrentSection =
    modules.track_npcs && npcs.length > 0
      ? wrapSection(sections.npcCurrentStates, formatNPCCurrentStates(npcs, flags))
      : null

  const storyContextSection = wrapSection(
    sections.storyContext,
    `${formatTemplate(labels.scene, { value: world.current_scene })}\n` +
      `${formatTemplate(labels.time, { value: world.time_of_day })}`,
  )

  const joinSections = (sections: Array<string | null | undefined>): string => sections.filter(Boolean).join("\n\n")

  const storyHeader = wrapSection(sections.storySoFar, "").replace(/\n$/, "")
  const afterHistory = joinSections([actionBlock])

  const stableBlock = joinSections([
    beforeCharacterBookSection,
    baseSection,
    afterCharacterBookSection,
    npcBaselineSection,
    locationSection,
    memorySection,
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
  recentTurns: TurnRow[],
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
    { role: "system", content: getSystemPrompt(modules) },
    { role: "user", content: contextBlock },
  ]
}

export function buildNpcCreationMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
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
    { role: "system", content: getNpcCreationPrompt(modules) },
    { role: "user", content: contextBlock },
  ]
}

export function buildImpersonateMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
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
    { role: "system", content: getImpersonatePrompt(modules) },
    { role: "user", content: prompt },
  ]
}
