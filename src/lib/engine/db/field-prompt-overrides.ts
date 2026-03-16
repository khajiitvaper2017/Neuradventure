import { z } from "zod"
import { getDb } from "@/engine/db/connection"

const KeySchema = z.string().trim().min(1).max(200)

function parseOverridesJson(text: string): Record<string, string> {
  try {
    const parsed = JSON.parse(text) as unknown
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {}
    const obj = parsed as Record<string, unknown>
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(obj)) {
      const key = typeof k === "string" ? k.trim() : ""
      if (!key) continue
      if (typeof v !== "string") continue
      out[key] = v
    }
    return out
  } catch {
    return {}
  }
}

export function getFieldPromptOverridesRow(): { overrides: Record<string, string>; updated_at: string } {
  const row = getDb().prepare("SELECT overrides_json, updated_at FROM field_prompt_overrides WHERE id = 1").get() as
    | { overrides_json: string; updated_at: string }
    | undefined
  if (!row) return { overrides: {}, updated_at: "" }
  return { overrides: parseOverridesJson(row.overrides_json), updated_at: row.updated_at ?? "" }
}

export function getFieldPromptOverridesMaxUpdatedAt(): string {
  const row = getDb().prepare("SELECT updated_at FROM field_prompt_overrides WHERE id = 1").get() as
    | { updated_at: string }
    | undefined
  return row?.updated_at ?? ""
}

export function setFieldPromptOverride(keyRaw: string, valueRaw: string): Record<string, string> {
  const key = KeySchema.parse(keyRaw)
  const value = String(valueRaw ?? "").trim()
  if (!value) return resetFieldPromptOverride(key)

  const db = getDb()
  const tx = db.transaction(() => {
    const existing = getFieldPromptOverridesRow().overrides
    const next = { ...existing, [key]: value }
    db.prepare("UPDATE field_prompt_overrides SET overrides_json = ?, updated_at = datetime('now') WHERE id = 1").run(
      JSON.stringify(next),
    )
    return next
  })
  return tx()
}

export function resetFieldPromptOverride(keyRaw: string): Record<string, string> {
  const key = KeySchema.parse(keyRaw)
  const db = getDb()
  const tx = db.transaction(() => {
    const existing = getFieldPromptOverridesRow().overrides
    if (!(key in existing)) return existing
    const next = { ...existing }
    delete next[key]
    db.prepare("UPDATE field_prompt_overrides SET overrides_json = ?, updated_at = datetime('now') WHERE id = 1").run(
      JSON.stringify(next),
    )
    return next
  })
  return tx()
}

export function resetAllFieldPromptOverrides(): void {
  getDb()
    .prepare("UPDATE field_prompt_overrides SET overrides_json = ?, updated_at = datetime('now') WHERE id = 1")
    .run("{}")
}
