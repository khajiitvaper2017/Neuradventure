import { AppError } from "@/errors"
import * as db from "@/engine/core/db"
import { storyToPlaintext, storyToTavernJSONL } from "@/engine/utils/converters/tavern"
import { parseStoryModules, parseStoryState } from "@/services/stories/state"
import { downloadText } from "@/services/stories/utils"

export async function exportAndDownload(
  id: number,
  format: "neuradventure" | "tavern" | "plaintext" = "neuradventure",
): Promise<void> {
  const row = db.getStory(id)
  if (!row) throw new AppError(404, "Story not found")
  const { character, world, npcs } = parseStoryState(row)
  const storyModules = parseStoryModules(row)
  const turns = db.getTurnsForStory(id)

  if (format === "tavern") {
    const jsonl = storyToTavernJSONL(row.title, row.opening_scenario, character.name, turns)
    downloadText(`story-${id}.jsonl`, jsonl, "application/x-jsonlines")
    return
  }

  if (format === "plaintext") {
    const text = storyToPlaintext(row.title, row.opening_scenario, turns)
    downloadText(`story-${id}.txt`, text, "text/plain; charset=utf-8")
    return
  }

  const data = JSON.stringify(
    {
      title: row.title,
      opening_scenario: row.opening_scenario,
      author_note: row.author_note ?? "",
      author_note_depth: row.author_note_depth ?? 4,
      author_note_position: row.author_note_position ?? 1,
      author_note_interval: row.author_note_interval ?? 1,
      author_note_role: row.author_note_role ?? 0,
      author_note_embed_state: (row.author_note_embed_state ?? 0) === 1,
      story_modules: storyModules,
      character,
      world,
      npcs,
      turns: turns.map((t) => ({
        turn_number: t.turn_number,
        player_input: t.player_input,
        narrative_text: t.narrative_text,
        created_at: t.created_at,
      })),
      exported_at: new Date().toISOString(),
    },
    null,
    2,
  )
  downloadText(`story-${id}.json`, data, "application/json")
}
