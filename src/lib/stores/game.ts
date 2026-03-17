import { writable, derived } from "svelte/store"
import type { MainCharacterState, NPCState, StoryModules, WorldState, TurnSummary } from "@/shared/types"

export type StoryCharacterKey = "player" | `npc:${string}`

export const currentStoryId = writable<number | null>(null)
export const currentStoryTitle = writable<string>("")
export const currentStoryOpeningScenario = writable<string>("")
export const currentStoryAuthorNote = writable<string>("")
export const currentStoryAuthorNoteDepth = writable<number>(4)
export const currentStoryAuthorNotePosition = writable<number>(1)
export const currentStoryAuthorNoteInterval = writable<number>(1)
export const currentStoryAuthorNoteRole = writable<number>(0)
export const currentStoryAuthorNoteEmbedState = writable<boolean>(false)
export const currentStoryModules = writable<StoryModules | null>(null)
export const currentStoryInitialWorld = writable<WorldState | null>(null)
export const character = writable<MainCharacterState | null>(null)
export const worldState = writable<WorldState | null>(null)
export const npcs = writable<NPCState[]>([])
export const activeStoryCharacterKey = writable<StoryCharacterKey>("player")
export const turns = writable<TurnSummary[]>([])
export const isGenerating = writable(false)
export const llmUpdateId = writable(0)

// Pending character being built in char-create screen (not yet saved)
export const pendingCharacter = writable<Omit<MainCharacterState, "inventory"> | null>(null)
export const pendingCharacterId = writable<number | null>(null)
export const pendingCharacterImportText = writable<string>("")
export const pendingCharacterImportCard = writable<object | null>(null)
export const pendingCharacterImportAvatarDataUrl = writable<string | null>(null)

// Pending new-story fields (persist across char-create navigation)
export const pendingStoryTitle = writable("")
export const pendingStoryScenario = writable("")
export const pendingStoryNPCs = writable<NPCState[]>([])
export const pendingStoryNpcCharacterIds = writable<number[]>([])
export const pendingStoryLocation = writable("")
export const pendingStoryDate = writable("")
export const pendingStoryTime = writable("")
export const pendingStoryGenerateDescription = writable("")
export const pendingStoryModules = writable<StoryModules | null>(null)
export const pendingCharacterGenerateDescription = writable("")

export const characterName = derived(character, ($c) => $c?.name ?? "")

export function resetActiveStory() {
  currentStoryId.set(null)
  currentStoryTitle.set("")
  currentStoryOpeningScenario.set("")
  currentStoryAuthorNote.set("")
  currentStoryAuthorNoteDepth.set(4)
  currentStoryAuthorNotePosition.set(1)
  currentStoryAuthorNoteInterval.set(1)
  currentStoryAuthorNoteRole.set(0)
  currentStoryAuthorNoteEmbedState.set(false)
  currentStoryModules.set(null)
  currentStoryInitialWorld.set(null)
  character.set(null)
  worldState.set(null)
  npcs.set([])
  activeStoryCharacterKey.set("player")
  turns.set([])
  isGenerating.set(false)
  llmUpdateId.set(0)
}

export function resetGame() {
  resetActiveStory()
  pendingStoryNPCs.set([])
  pendingStoryNpcCharacterIds.set([])
  pendingStoryLocation.set("")
  pendingStoryDate.set("")
  pendingStoryTime.set("")
  pendingStoryGenerateDescription.set("")
  pendingStoryModules.set(null)
  pendingCharacterGenerateDescription.set("")
  pendingCharacterImportText.set("")
  pendingCharacterImportCard.set(null)
  pendingCharacterImportAvatarDataUrl.set(null)
  pendingCharacterId.set(null)
}

export function markLlmUpdate() {
  llmUpdateId.update((n) => n + 1)
}
