import { getDb } from "@/db/connection"
import type { GenerationParams } from "@/types/api"

export interface SamplerPresetRow {
  id: number
  name: string
  description: string
  params_json: string
  created_at: string
  updated_at: string
}

export interface SamplerPreset {
  id: number
  name: string
  description: string
  params: GenerationParams
}

export function listSamplerPresets(): SamplerPreset[] {
  const rows = getDb()
    .prepare("SELECT id, name, description, params_json, created_at, updated_at FROM sampler_presets ORDER BY name ASC")
    .all() as SamplerPresetRow[]
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    description: r.description,
    params: JSON.parse(r.params_json) as GenerationParams,
  }))
}

export function upsertSamplerPreset(input: Omit<SamplerPreset, "id">): SamplerPreset {
  const db = getDb()
  const tx = db.transaction((preset: Omit<SamplerPreset, "id">) => {
    db.prepare(
      `INSERT INTO sampler_presets (name, description, params_json)
       VALUES (?, ?, ?)
       ON CONFLICT(name) DO UPDATE SET
         description = excluded.description,
         params_json = excluded.params_json,
         updated_at = datetime('now')`,
    ).run(preset.name, preset.description, JSON.stringify(preset.params))

    const row = db.prepare("SELECT id FROM sampler_presets WHERE name = ?").get(preset.name) as { id: number }
    return { ...preset, id: row.id }
  })
  return tx(input)
}

export function deleteSamplerPreset(id: number): boolean {
  const res = getDb().prepare("DELETE FROM sampler_presets WHERE id = ?").run(id)
  return res.changes > 0
}
