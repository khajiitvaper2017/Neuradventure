import OpenAI from "openai"
import type { MainCharacterState, NPCState, StoryModules, WorldState } from "../core/models.js"
import type { TurnRow } from "../core/db.js"
import { getGenerationParams } from "./client.js"
import { getImpersonatePrompt, getNpcCreationPrompt, getSystemPrompt } from "./config.js"
import {
  buildHistoryBlock,
  formatInventory,
  formatLocations,
  formatNPCBaselines,
  formatNPCCurrentStates,
  wrapSection,
  estimateTokens,
} from "./format.js"
import { formatTemplate, getLlmStrings, getServerDefaults } from "../core/strings.js"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "../schemas/story-modules.js"
import { renderCharacterBook } from "../utils/tavern/character-book.js"
import type { CharacterBook } from "../utils/converters/tavern.js"

// ─── Shared context block builder ─────────────────────────────────────────────

export interface ContextBlockOpts {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
  recentTurns: TurnRow[]
  ctxLimit: number
  initialCharacter?: MainCharacterState
  actionBlock?: string | null
  memory?: string | null
  authorNote?: { text: string; depth: number } | null
  characterBook?: CharacterBook | null
  modules?: StoryModules
}

function buildContextBlock(opts: ContextBlockOpts): string {
  const { character, world, npcs, recentTurns, ctxLimit, initialCharacter, actionBlock, authorNote, characterBook } =
    opts
  const initial = initialCharacter ?? character
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const labels = llmStrings.contextLabels
  const sections = llmStrings.sections
  const none = defaults.format.noneLower
  const modules: StoryModules = opts.modules ?? DEFAULT_STORY_MODULES
  const flags = resolveModuleFlags(modules)
  const generalDescription = character.general_description?.trim() || defaults.unknown.generalDescription
  const initialGeneralDescription = initial.general_description?.trim() || defaults.unknown.generalDescription

  // ── STABLE (cached across turns) ──
  const initialSection = wrapSection(
    sections.initialCharacter,
    [
      formatTemplate(labels.generalDescription, { value: initialGeneralDescription }),
      flags.useCharAppearance
        ? formatTemplate(labels.baselineAppearance, { value: initial.baseline_appearance })
        : null,
      flags.useCharAppearance ? formatTemplate(labels.currentAppearance, { value: initial.current_appearance }) : null,
      flags.useCharAppearance ? formatTemplate(labels.wearing, { value: initial.current_clothing }) : null,
    ]
      .filter(Boolean)
      .join("\n"),
  )

  const baseLines = [
    formatTemplate(labels.nameRaceGender, {
      name: character.name,
      race: character.race,
      gender: character.gender,
    }),
    formatTemplate(labels.generalDescription, { value: generalDescription }),
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

  const authorNoteSection =
    authorNote && authorNote.text.trim() ? wrapSection(sections.authorNote, authorNote.text.trim()) : null

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
  const afterHistory = joinSections([currentSection, npcCurrentSection, storyContextSection, actionBlock])

  const stableBlock = joinSections([
    initialSection,
    beforeCharacterBookSection,
    baseSection,
    afterCharacterBookSection,
    npcBaselineSection,
    locationSection,
    memorySection,
    authorNoteSection,
  ])

  const baseTokens = estimateTokens(joinSections([stableBlock, storyHeader, afterHistory]))
  const { summary, history } = buildHistoryBlock(recentTurns, world, ctxLimit, baseTokens, authorNote)

  const storySoFarHeader = history ? storyHeader : null
  return joinSections([stableBlock, summary || null, storySoFarHeader, history || null, afterHistory || null])
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
  authorNote?: { text: string; depth: number } | null,
  modules?: StoryModules,
  characterBook?: CharacterBook | null,
): OpenAI.ChatCompletionMessageParam[] {
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit
  const hasPlayerInput = playerInput.trim().length > 0
  const llmStrings = getLlmStrings()
  const sections = llmStrings.sections
  const actionSection =
    actionMode === "story"
      ? hasPlayerInput
        ? wrapSection(sections.storyContinuation, playerInput)
        : wrapSection(sections.storyContinuation, "")
      : hasPlayerInput
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
  authorNote?: { text: string; depth: number } | null,
  modules?: StoryModules,
  characterBook?: CharacterBook | null,
): OpenAI.ChatCompletionMessageParam[] {
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
  authorNote?: { text: string; depth: number } | null,
  modules?: StoryModules,
  characterBook?: CharacterBook | null,
): OpenAI.ChatCompletionMessageParam[] {
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
