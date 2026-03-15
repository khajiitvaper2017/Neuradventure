import { z } from "zod"
import { AppError } from "@/errors"
import * as db from "@/engine/core/db"
import { MainCharacterStateStoredSchema, NPCStateStoredSchema, WorldStateStoredSchema } from "@/engine/core/models"
import { createNewStory } from "@/engine/game"
import { detectImportFormat, parseTavernJSONL } from "@/engine/utils/converters/tavern"
import { StoryModulesSchema } from "@/engine/schemas/story-modules"
import { parseStoryState } from "@/services/stories/state"

const ImportTurnSchema = z.object({
  player_input: z.string().min(1),
  narrative_text: z.string().min(1),
  action_mode: z.string().optional(),
})

const ImportStorySchema = z.object({
  title: z.string(),
  opening_scenario: z.string(),
  character: MainCharacterStateStoredSchema,
  world: WorldStateStoredSchema,
  npcs: z.array(NPCStateStoredSchema).default([]),
  story_modules: StoryModulesSchema.optional(),
  author_note: z.string().optional(),
  author_note_depth: z.number().int().min(0).max(100).optional(),
  author_note_position: z.number().int().min(0).max(2).optional(),
  author_note_interval: z.number().int().min(0).max(1000).optional(),
  author_note_role: z.number().int().min(0).max(2).optional(),
  author_note_embed_state: z
    .union([z.boolean(), z.number().int().min(0).max(1)])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === true || v === 1)),
  turns: z.array(ImportTurnSchema).optional(),
})

export async function importStory(data: object | string): Promise<{ id: number }> {
  const format = detectImportFormat(data)

  if (format === "tavern-card") {
    throw new AppError(400, "Character card detected. Use character import instead.")
  }

  if (format === "tavern-jsonl") {
    const parsed = parseTavernJSONL(typeof data === "string" ? data : JSON.stringify(data))
    const character = MainCharacterStateStoredSchema.parse({ name: parsed.userName })
    const { inventory: _inventory, ...base } = character
    void _inventory
    const characterId = db.createCharacter(base)
    const title =
      parsed.characterName && parsed.characterName !== "Narrator"
        ? `Imported Chat with ${parsed.characterName}`
        : "Imported Chat"
    const storyId = createNewStory(
      title,
      parsed.openingScenario,
      character,
      [],
      undefined,
      undefined,
      undefined,
      db.getSettings().storyDefaults,
      characterId,
    )
    const storyRow = db.getStory(storyId)
    if (storyRow) {
      const snapshot = parseStoryState(storyRow)
      parsed.turns.forEach((turn, index) => {
        db.createTurn(
          storyId,
          index + 1,
          "do",
          null,
          turn.player_input,
          turn.narrative_text,
          null,
          snapshot.character,
          snapshot.world,
          snapshot.npcs,
        )
      })
    }
    return { id: storyId }
  }

  if (format === "neuradventure") {
    const parsed = ImportStorySchema.parse(data)
    const { inventory: _inventory, ...base } = parsed.character
    void _inventory
    const characterId = db.createCharacter(base)
    const settings = db.getSettings()
    const id = db.createStory(
      parsed.title,
      parsed.opening_scenario,
      parsed.character,
      parsed.world,
      parsed.npcs,
      parsed.story_modules ?? db.getSettings().storyDefaults,
      characterId,
      parsed.author_note ?? "",
      parsed.author_note_depth ?? 4,
      parsed.author_note_position ?? settings.defaultAuthorNotePosition ?? 1,
      parsed.author_note_interval ?? settings.defaultAuthorNoteInterval ?? 1,
      parsed.author_note_role ?? settings.defaultAuthorNoteRole ?? 0,
      parsed.author_note_embed_state ?? settings.defaultAuthorNoteEmbedState ?? false,
    )

    if (
      parsed.author_note !== undefined ||
      parsed.author_note_depth !== undefined ||
      parsed.author_note_position !== undefined ||
      parsed.author_note_interval !== undefined ||
      parsed.author_note_role !== undefined ||
      parsed.author_note_embed_state !== undefined
    ) {
      db.updateStoryMeta(id, {
        author_note: parsed.author_note,
        author_note_depth: parsed.author_note_depth,
        author_note_position: parsed.author_note_position,
        author_note_interval: parsed.author_note_interval,
        author_note_role: parsed.author_note_role,
        author_note_embed_state: parsed.author_note_embed_state,
      })
    }

    if (parsed.turns && parsed.turns.length > 0) {
      const row = db.getStory(id)
      if (row) {
        const snapshot = parseStoryState(row)
        parsed.turns.forEach((turn, index) => {
          db.createTurn(
            id,
            index + 1,
            turn.action_mode ?? "do",
            null,
            turn.player_input,
            turn.narrative_text,
            null,
            snapshot.character,
            snapshot.world,
            snapshot.npcs,
          )
        })
      }
    }

    return { id }
  }

  throw new AppError(400, "Unrecognized import format. Expected Neuradventure JSON or SillyTavern JSONL.")
}
