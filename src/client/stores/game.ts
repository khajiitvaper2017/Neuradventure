import { writable, derived } from "svelte/store"
import type { MainCharacterState, NPCState, WorldState, TurnSummary } from "../api/client.js"

export const currentStoryId = writable<number | null>(null)
export const currentStoryTitle = writable<string>("")
export const currentStoryOpeningScenario = writable<string>("")
export const character = writable<MainCharacterState | null>(null)
export const worldState = writable<WorldState | null>(null)
export const npcs = writable<NPCState[]>([])
export const turns = writable<TurnSummary[]>([])
export const isGenerating = writable(false)
export const llmUpdateId = writable(0)

// Pending character being built in char-create screen (not yet saved)
export const pendingCharacter = writable<Omit<MainCharacterState, "inventory"> | null>(null)
export const pendingCharacterId = writable<number | null>(null)

// Pending new-story fields (persist across char-create navigation)
export const pendingStoryTitle = writable("")
export const pendingStoryScenario = writable("")
export const pendingStoryNPCs = writable<NPCState[]>([])
export const pendingStoryLocation = writable("")
export const pendingStoryGenerateDescription = writable("")
export const pendingCharacterGenerateDescription = writable("")

export const characterName = derived(character, ($c) => $c?.name ?? "")

export function resetGame() {
  currentStoryId.set(null)
  currentStoryTitle.set("")
  currentStoryOpeningScenario.set("")
  character.set(null)
  worldState.set(null)
  npcs.set([])
  turns.set([])
  isGenerating.set(false)
  llmUpdateId.set(0)
  pendingStoryNPCs.set([])
  pendingStoryLocation.set("")
  pendingStoryGenerateDescription.set("")
  pendingCharacterGenerateDescription.set("")
  pendingCharacterId.set(null)
}

export function markLlmUpdate() {
  llmUpdateId.update((n) => n + 1)
}
