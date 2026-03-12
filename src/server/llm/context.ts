import OpenAI from "openai"
import type { MainCharacterState, NPCState, WorldState } from "../models.js"
import type { TurnRow } from "../db.js"
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

  // ── STABLE (cached across turns) ──
  const initialSection = wrapSection(
    "initial_character",
    `Baseline appearance: ${initial.appearance.baseline_appearance}\n` +
      `Current appearance: ${initial.appearance.current_appearance}\n` +
      `Wearing: ${initial.appearance.current_clothing}`,
  )

  const baseSection = wrapSection(
    "player_character_base",
    `Name: ${character.name} · ${character.race} · ${character.gender}\n` +
      `Personality traits: ${character.personality_traits.join(", ") || "none"}\n` +
      `Major flaws: ${character.major_flaws.join(", ") || "none"}\n` +
      `Quirks: ${character.quirks.join(", ") || "none"}\n` +
      `Perks: ${character.perks.join(", ") || "none"}`,
  )

  const npcBaselineSection = npcs.length > 0 ? wrapSection("npc_baselines", formatNPCBaselines(npcs)) : null

  const locationSection =
    world.locations && world.locations.length > 0 ? wrapSection("locations", formatLocations(world.locations)) : null

  // ── SEMI-STABLE ──
  const memorySection = world.memory ? wrapSection("memory", world.memory) : null

  const authorNoteSection =
    authorNote && authorNote.text.trim() ? wrapSection("author_note", authorNote.text.trim()) : null

  // ── VOLATILE ──
  const currentSection = wrapSection(
    "player_character_state",
    `Current appearance: ${character.appearance.current_appearance}\n` +
      `Wearing: ${character.appearance.current_clothing}\n` +
      `Location: ${character.current_location}\n` +
      `Inventory: ${formatInventory(character.inventory)}`,
  )

  const npcCurrentSection = npcs.length > 0 ? wrapSection("npc_current_states", formatNPCCurrentStates(npcs)) : null

  const storyContextSection = wrapSection(
    "story_context",
    `Scene: ${world.current_scene}\n` + `Date: ${world.current_date}\n` + `Time: ${world.time_of_day}`,
  )

  const joinSections = (sections: Array<string | null | undefined>): string => sections.filter(Boolean).join("\n\n")

  const storyHeader = wrapSection("story_so_far", "").replace(/\n$/, "")
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
  const actionSection =
    actionMode === "story"
      ? hasPlayerInput
        ? wrapSection("story_continuation", playerInput)
        : wrapSection("story_continuation", "")
      : hasPlayerInput
        ? wrapSection("players_action", actionMode === "say" ? `You say: ${playerInput}` : playerInput)
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
  const actionBlock =
    npcName.trim().length > 0 ? wrapSection("introduce_new_npc", npcName) : wrapSection("introduce_new_npc", "")

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
  const actionModeHint =
    actionMode === "say"
      ? "Say only the exact words spoken. No quotes or 'You say'."
      : actionMode === "story"
        ? "Continue the story in 1-2 short sentences, second-person present tense."
        : "Describe the action the player takes in a short, concrete clause."
  const actionModeSection = wrapSection("action_mode", `${actionMode}\n${actionModeHint}`)

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
  const prompt = `${contextBlock}\n\n${wrapSection("players_action", "")}`

  return [
    { role: "system", content: getImpersonatePrompt() },
    { role: "user", content: prompt },
  ]
}
