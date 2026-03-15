import { ApiError } from "./http.js"
import * as db from "../engine/core/db.js"

export type PromptHistoryKind = "story" | "character" | "chat"

function clampLimit(limit?: number): number | undefined {
  if (typeof limit !== "number" || !Number.isFinite(limit)) return undefined
  const n = Math.trunc(limit)
  if (n <= 0) return undefined
  return Math.min(n, 50)
}

export const promptHistory = {
  list: async (kind: PromptHistoryKind, limit?: number) => {
    const items = db.listPromptHistory(kind, clampLimit(limit))
    return items
  },

  add: async (kind: PromptHistoryKind, prompt: string, limit?: number) => {
    const trimmed = prompt.trim()
    if (!trimmed) throw new ApiError(400, "Prompt is required")
    const items = db.upsertPromptHistory(kind, trimmed, clampLimit(limit))
    return items
  },

  bulkAdd: async (kind: PromptHistoryKind, prompts: string[], limit?: number) => {
    const cleaned = prompts.map((p) => p.trim()).filter(Boolean)
    if (cleaned.length === 0) throw new ApiError(400, "At least one prompt is required")
    const items = db.upsertPromptHistoryMany(kind, cleaned, clampLimit(limit))
    return items
  },

  remove: async (kind: PromptHistoryKind, prompt: string, limit?: number) => {
    const trimmed = prompt.trim()
    if (!trimmed) throw new ApiError(400, "Prompt is required")
    const items = db.deletePromptHistory(kind, trimmed, clampLimit(limit))
    return items
  },
}
