import OpenAI from "openai"
import type { MainCharacterState, NPCState, WorldState } from "../core/models.js"
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
}

function buildContextBlock(opts: ContextBlockOpts): string {
  const { character, world, npcs, recentTurns, ctxLimit, initialCharacter, actionBlock, authorNote } = opts
  const initial = initialCharacter ?? character
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const labels = llmStrings.contextLabels
  const sections = llmStrings.sections
  const none = defaults.format.noneLower

  // ── STABLE (cached across turns) ──
  const initialSection = wrapSection(
    sections.initialCharacter,
    `${formatTemplate(labels.baselineAppearance, { value: initial.appearance.baseline_appearance })}\n` +
      `${formatTemplate(labels.currentAppearance, { value: initial.appearance.current_appearance })}\n` +
      `${formatTemplate(labels.wearing, { value: initial.appearance.current_clothing })}`,
  )

  const baseSection = wrapSection(
    sections.playerCharacterBase,
    `${formatTemplate(labels.nameRaceGender, {
      name: character.name,
      race: character.race,
      gender: character.gender,
    })}\n` +
      `${formatTemplate(labels.personalityTraits, {
        value: character.personality_traits.join(", ") || none,
      })}\n` +
      `${formatTemplate(labels.majorFlaws, { value: character.major_flaws.join(", ") || none })}\n` +
      `${formatTemplate(labels.quirks, { value: character.quirks.join(", ") || none })}\n` +
      `${formatTemplate(labels.perks, { value: character.perks.join(", ") || none })}`,
  )

  const npcBaselineSection = npcs.length > 0 ? wrapSection(sections.npcBaselines, formatNPCBaselines(npcs)) : null

  const locationSection =
    world.locations && world.locations.length > 0
      ? wrapSection(sections.locations, formatLocations(world.locations))
      : null

  // ── SEMI-STABLE ──
  const memorySection = world.memory ? wrapSection(sections.memory, world.memory) : null

  const authorNoteSection =
    authorNote && authorNote.text.trim() ? wrapSection(sections.authorNote, authorNote.text.trim()) : null

  // ── VOLATILE ──
  const currentSection = wrapSection(
    sections.playerCharacterState,
    `${formatTemplate(labels.currentAppearance, { value: character.appearance.current_appearance })}\n` +
      `${formatTemplate(labels.wearing, { value: character.appearance.current_clothing })}\n` +
      `${formatTemplate(labels.location, { value: character.current_location })}\n` +
      `${formatTemplate(labels.inventory, { value: formatInventory(character.inventory) })}`,
  )

  const npcCurrentSection =
    npcs.length > 0 ? wrapSection(sections.npcCurrentStates, formatNPCCurrentStates(npcs)) : null

  const storyContextSection = wrapSection(
    sections.storyContext,
    `${formatTemplate(labels.scene, { value: world.current_scene })}\n` +
      `${formatTemplate(labels.date, { value: world.current_date })}\n` +
      `${formatTemplate(labels.time, { value: world.time_of_day })}`,
  )

  const joinSections = (sections: Array<string | null | undefined>): string => sections.filter(Boolean).join("\n\n")

  const storyHeader = wrapSection(sections.storySoFar, "").replace(/\n$/, "")
  const afterHistory = joinSections([currentSection, npcCurrentSection, storyContextSection, actionBlock])

  const stableBlock = joinSections([
    initialSection,
    baseSection,
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
  })

  return [
    { role: "system", content: getSystemPrompt() },
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
  })

  return [
    { role: "system", content: getNpcCreationPrompt() },
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
  })
  const prompt = `${contextBlock}\n\n${wrapSection(sections.playersAction, "")}`

  return [
    { role: "system", content: getImpersonatePrompt() },
    { role: "user", content: prompt },
  ]
}
