import { getDb } from "@/engine/db/connection"

export type PromptHistoryKind = "story" | "character" | "chat"

const DEFAULT_LIMIT = 12

function normalizePrompt(prompt: string): string {
  return prompt.trim()
}

export function listPromptHistory(kind: PromptHistoryKind, limit = DEFAULT_LIMIT): string[] {
  const db = getDb()
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)))
  const rows = db
    .prepare(
      `SELECT prompt
       FROM prompt_history
       WHERE kind = ?
       ORDER BY last_used DESC
       LIMIT ?`,
    )
    .all(kind, safeLimit) as Array<{ prompt: string }>
  return rows.map((r) => r.prompt).filter(Boolean)
}

export function upsertPromptHistory(kind: PromptHistoryKind, prompt: string, limit = DEFAULT_LIMIT): string[] {
  const db = getDb()
  const normalized = normalizePrompt(prompt)
  if (!normalized) return listPromptHistory(kind, limit)

  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)))
  db.prepare(
    `INSERT INTO prompt_history (kind, prompt, last_used, use_count)
     VALUES (?, ?, datetime('now'), 1)
     ON CONFLICT(kind, prompt) DO UPDATE SET
       last_used = datetime('now'),
       use_count = use_count + 1`,
  ).run(kind, normalized)

  db.prepare(
    `DELETE FROM prompt_history
     WHERE kind = ?
       AND prompt NOT IN (
         SELECT prompt FROM prompt_history WHERE kind = ? ORDER BY last_used DESC LIMIT ?
       )`,
  ).run(kind, kind, safeLimit)

  return listPromptHistory(kind, safeLimit)
}

export function upsertPromptHistoryMany(kind: PromptHistoryKind, prompts: string[], limit = DEFAULT_LIMIT): string[] {
  const db = getDb()
  const safeLimit = Math.max(1, Math.min(50, Math.floor(limit)))
  const normalized = prompts.map(normalizePrompt).filter(Boolean)
  if (normalized.length === 0) return listPromptHistory(kind, safeLimit)

  const tx = db.transaction((items: string[]) => {
    for (let i = 0; i < items.length; i++) {
      const prompt = items[i]!
      const offsetSeconds = i === 0 ? "0 seconds" : `-${i} seconds`
      db.prepare(
        `INSERT INTO prompt_history (kind, prompt, last_used, use_count)
         VALUES (?, ?, datetime('now', ?), 1)
         ON CONFLICT(kind, prompt) DO UPDATE SET
           last_used = datetime('now', ?),
           use_count = use_count + 1`,
      ).run(kind, prompt, offsetSeconds, offsetSeconds)
    }
  })
  tx(normalized)

  db.prepare(
    `DELETE FROM prompt_history
     WHERE kind = ?
       AND prompt NOT IN (
         SELECT prompt FROM prompt_history WHERE kind = ? ORDER BY last_used DESC LIMIT ?
       )`,
  ).run(kind, kind, safeLimit)

  return listPromptHistory(kind, safeLimit)
}

export function deletePromptHistory(kind: PromptHistoryKind, prompt: string, limit = DEFAULT_LIMIT): string[] {
  const db = getDb()
  const normalized = normalizePrompt(prompt)
  if (normalized) {
    db.prepare("DELETE FROM prompt_history WHERE kind = ? AND LOWER(prompt) = LOWER(?)").run(kind, normalized)
  }
  return listPromptHistory(kind, limit)
}
