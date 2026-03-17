import { z } from "zod"
import { getDb } from "@/db/connection"

import type {
  CharacterCustomFieldPlacement,
  CustomFieldDef,
  CustomFieldPlacement,
  CustomFieldScope,
  CustomFieldValueType,
  WorldCustomFieldPlacement,
} from "@/types/api"

const IdSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .transform((v) => v.toLowerCase())
  .pipe(z.string().regex(/^[a-z][a-z0-9_]*$/, "id must be a slug (lowercase letters/numbers/underscores)"))

const ScopeSchema = z.enum(["character", "world"] satisfies [CustomFieldScope, ...CustomFieldScope[]])
const ValueTypeSchema = z.enum(["text", "list"] satisfies [CustomFieldValueType, ...CustomFieldValueType[]])

function normalizePlacement(scope: CustomFieldScope, raw: string): CustomFieldPlacement {
  const trimmed = raw.trim()
  if (scope === "character") return (trimmed === "current" ? "current" : "base") satisfies CharacterCustomFieldPlacement
  return (trimmed === "memory" ? "memory" : "context") satisfies WorldCustomFieldPlacement
}

function toDef(row: {
  id: string
  scope: string
  value_type: string
  label: string
  placement: string
  prompt: string
  enabled: number
  sort_order: number
  created_at: string
  updated_at: string
}): CustomFieldDef {
  const scope = ScopeSchema.parse(row.scope)
  const value_type = ValueTypeSchema.parse(row.value_type)
  return {
    id: String(row.id),
    scope,
    value_type,
    label: String(row.label ?? "").trim() || String(row.id),
    placement: normalizePlacement(scope, String(row.placement ?? "")),
    prompt: String(row.prompt ?? ""),
    enabled: Number(row.enabled) === 1,
    sort_order: Number.isFinite(row.sort_order) ? Math.trunc(row.sort_order) : 0,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
  }
}

export function listCustomFields(): CustomFieldDef[] {
  const rows = getDb()
    .prepare(
      "SELECT id, scope, value_type, label, placement, prompt, enabled, sort_order, created_at, updated_at FROM custom_fields ORDER BY scope ASC, sort_order ASC, label ASC",
    )
    .all() as Array<{
    id: string
    scope: string
    value_type: string
    label: string
    placement: string
    prompt: string
    enabled: number
    sort_order: number
    created_at: string
    updated_at: string
  }>
  return rows.map(toDef)
}

export function getCustomFieldsMaxUpdatedAt(): string {
  const row = getDb().prepare("SELECT MAX(updated_at) as max_updated_at FROM custom_fields").get() as
    | { max_updated_at: string | null }
    | undefined
  return row?.max_updated_at ?? ""
}

export function upsertCustomField(input: Omit<CustomFieldDef, "created_at" | "updated_at">): CustomFieldDef {
  const db = getDb()
  const tx = db.transaction((raw: Omit<CustomFieldDef, "created_at" | "updated_at">) => {
    const id = IdSchema.parse(raw.id)
    const scope = ScopeSchema.parse(raw.scope)
    const value_type = ValueTypeSchema.parse(raw.value_type)
    const label = String(raw.label ?? "").trim() || id
    const prompt = String(raw.prompt ?? "")
    const enabled = raw.enabled ? 1 : 0
    const sortOrder = Number.isFinite(raw.sort_order) ? Math.trunc(raw.sort_order) : 0
    const placement = normalizePlacement(scope, String(raw.placement ?? ""))

    db.prepare(
      `INSERT INTO custom_fields (id, scope, value_type, label, placement, prompt, enabled, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         scope = excluded.scope,
         value_type = excluded.value_type,
         label = excluded.label,
         placement = excluded.placement,
         prompt = excluded.prompt,
         enabled = excluded.enabled,
         sort_order = excluded.sort_order,
         updated_at = datetime('now')`,
    ).run(id, scope, value_type, label, placement, prompt, enabled, sortOrder)

    const row = db
      .prepare(
        "SELECT id, scope, value_type, label, placement, prompt, enabled, sort_order, created_at, updated_at FROM custom_fields WHERE id = ?",
      )
      .get(id) as
      | {
          id: string
          scope: string
          value_type: string
          label: string
          placement: string
          prompt: string
          enabled: number
          sort_order: number
          created_at: string
          updated_at: string
        }
      | undefined
    if (!row) throw new Error("Failed to save custom field")
    return toDef(row)
  })
  return tx(input)
}

export function deleteCustomField(idRaw: string): boolean {
  const id = IdSchema.parse(idRaw)
  const res = getDb().prepare("DELETE FROM custom_fields WHERE id = ?").run(id)
  return res.changes > 0
}

export function deleteAllCustomFields(): number {
  const res = getDb().prepare("DELETE FROM custom_fields").run()
  return res.changes
}
