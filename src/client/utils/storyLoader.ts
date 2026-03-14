import { api } from "../api/client.js"
import {
  currentStoryId,
  currentStoryTitle,
  currentStoryOpeningScenario,
  currentStoryAuthorNote,
  currentStoryAuthorNoteDepth,
  currentStoryAuthorNotePosition,
  currentStoryAuthorNoteInterval,
  currentStoryAuthorNoteRole,
  currentStoryAuthorNoteEmbedState,
  currentStoryModules,
  currentStoryInitialWorld,
  character,
  worldState,
  npcs,
  turns,
} from "../stores/game.js"

export async function loadStoryById(id: number): Promise<void> {
  const [detail, storyTurns] = await Promise.all([api.stories.get(id), api.turns.list(id)])
  currentStoryId.set(detail.id)
  currentStoryTitle.set(detail.title)
  currentStoryOpeningScenario.set(detail.opening_scenario)
  currentStoryAuthorNote.set(detail.author_note ?? "")
  currentStoryAuthorNoteDepth.set(detail.author_note_depth ?? 4)
  currentStoryAuthorNotePosition.set(detail.author_note_position ?? 1)
  currentStoryAuthorNoteInterval.set(detail.author_note_interval ?? 1)
  currentStoryAuthorNoteRole.set(detail.author_note_role ?? 0)
  currentStoryAuthorNoteEmbedState.set(detail.author_note_embed_state ?? false)
  currentStoryModules.set(detail.story_modules ?? null)
  currentStoryInitialWorld.set(detail.initial_world)
  character.set(detail.character)
  worldState.set(detail.world)
  npcs.set(detail.npcs)
  turns.set(storyTurns)
}
