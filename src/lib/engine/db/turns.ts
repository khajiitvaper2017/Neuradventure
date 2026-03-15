import type { MainCharacterState, NPCState, WorldState } from "@/shared/types"
import { getDb } from "@/engine/db/connection"

export interface TurnRow {
  id: number
  story_id: number
  turn_number: number
  action_mode: string
  active_variant_id: number | null
  request_id: string | null
  player_input: string
  narrative_text: string
  background_events: string | null
  character_snapshot_json: string
  world_snapshot_json: string
  npc_snapshot_json: string
  created_at: string
}

export interface TurnVariantRow {
  id: number
  turn_id: number
  variant_index: number
  narrative_text: string
  background_events: string | null
  character_snapshot_json: string
  world_snapshot_json: string
  npc_snapshot_json: string
  created_at: string
}

export interface CanceledTurnVariantPayload {
  variant_index: number
  narrative_text: string
  background_events: string | null
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
}

export interface CanceledTurnPayload {
  turn_number: number
  action_mode: string
  active_variant_index: number | null
  player_input: string
  narrative_text: string
  background_events: string | null
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
  variants: CanceledTurnVariantPayload[]
}

export function getTurnsForStory(story_id: number): TurnRow[] {
  return getDb().prepare("SELECT * FROM turns WHERE story_id = ? ORDER BY turn_number ASC").all(story_id) as TurnRow[]
}

export function getTurn(id: number): TurnRow | undefined {
  return getDb().prepare("SELECT * FROM turns WHERE id = ?").get(id) as TurnRow | undefined
}

export function getTurnByRequestId(request_id: string): TurnRow | undefined {
  return getDb().prepare("SELECT * FROM turns WHERE request_id = ?").get(request_id) as TurnRow | undefined
}

export function getLastTurnForStory(story_id: number): TurnRow | undefined {
  return getDb().prepare("SELECT * FROM turns WHERE story_id = ? ORDER BY turn_number DESC LIMIT 1").get(story_id) as
    | TurnRow
    | undefined
}

export function getNextTurnNumber(story_id: number): number {
  const result = getDb()
    .prepare("SELECT COALESCE(MAX(turn_number), 0) + 1 as next FROM turns WHERE story_id = ?")
    .get(story_id) as { next: number }
  return result.next
}

export function createTurn(
  story_id: number,
  turn_number: number,
  action_mode: string,
  request_id: string | null,
  player_input: string,
  narrative_text: string,
  background_events: string | null,
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
): number {
  const result = getDb()
    .prepare(
      `INSERT INTO turns (story_id, turn_number, action_mode, request_id, player_input, narrative_text, background_events,
       character_snapshot_json, world_snapshot_json, npc_snapshot_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      story_id,
      turn_number,
      action_mode,
      request_id,
      player_input,
      narrative_text,
      background_events,
      JSON.stringify(character),
      JSON.stringify(world),
      JSON.stringify(npcs),
    )
  return result.lastInsertRowid as number
}

export function updateTurn(id: number, fields: { player_input?: string; narrative_text?: string }): boolean {
  const updates: string[] = []
  const values: unknown[] = []
  if (fields.player_input !== undefined) {
    updates.push("player_input = ?")
    values.push(fields.player_input)
  }
  if (fields.narrative_text !== undefined) {
    updates.push("narrative_text = ?")
    values.push(fields.narrative_text)
  }
  if (updates.length === 0) return false
  values.push(id)
  const result = getDb()
    .prepare(`UPDATE turns SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values)
  if (fields.narrative_text !== undefined) {
    const active = getDb().prepare("SELECT active_variant_id FROM turns WHERE id = ?").get(id) as
      | { active_variant_id: number | null }
      | undefined
    if (active?.active_variant_id) {
      getDb()
        .prepare("UPDATE turn_variants SET narrative_text = ? WHERE id = ?")
        .run(fields.narrative_text, active.active_variant_id)
    }
  }
  return result.changes > 0
}

export function updateTurnSnapshot(
  id: number,
  fields: {
    narrative_text: string
    background_events: string | null
    character: MainCharacterState
    world: WorldState
    npcs: NPCState[]
    action_mode?: string
    active_variant_id?: number
  },
): boolean {
  const updates: string[] = [
    "narrative_text = ?",
    "background_events = ?",
    "character_snapshot_json = ?",
    "world_snapshot_json = ?",
    "npc_snapshot_json = ?",
  ]
  const values: unknown[] = [
    fields.narrative_text,
    fields.background_events,
    JSON.stringify(fields.character),
    JSON.stringify(fields.world),
    JSON.stringify(fields.npcs),
  ]
  if (fields.action_mode !== undefined) {
    updates.push("action_mode = ?")
    values.push(fields.action_mode)
  }
  if (fields.active_variant_id !== undefined) {
    updates.push("active_variant_id = ?")
    values.push(fields.active_variant_id)
  }
  values.push(id)
  const result = getDb()
    .prepare(`UPDATE turns SET ${updates.join(", ")} WHERE id = ?`)
    .run(...values)
  return result.changes > 0
}

export function deleteTurn(id: number): boolean {
  const result = getDb().prepare("DELETE FROM turns WHERE id = ?").run(id)
  return result.changes > 0
}

export function listTurnVariants(turn_id: number): TurnVariantRow[] {
  return getDb()
    .prepare("SELECT * FROM turn_variants WHERE turn_id = ? ORDER BY variant_index ASC")
    .all(turn_id) as TurnVariantRow[]
}

export function getTurnVariant(id: number): TurnVariantRow | undefined {
  return getDb().prepare("SELECT * FROM turn_variants WHERE id = ?").get(id) as TurnVariantRow | undefined
}

export function createTurnVariant(
  turn_id: number,
  narrative_text: string,
  background_events: string | null,
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
): { id: number; variant_index: number } {
  const next = getDb()
    .prepare("SELECT COALESCE(MAX(variant_index), 0) + 1 as next FROM turn_variants WHERE turn_id = ?")
    .get(turn_id) as { next: number }
  const result = getDb()
    .prepare(
      `INSERT INTO turn_variants (
        turn_id,
        variant_index,
        narrative_text,
        background_events,
        character_snapshot_json,
        world_snapshot_json,
        npc_snapshot_json
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      turn_id,
      next.next,
      narrative_text,
      background_events,
      JSON.stringify(character),
      JSON.stringify(world),
      JSON.stringify(npcs),
    )
  return { id: result.lastInsertRowid as number, variant_index: next.next }
}

export function setActiveTurnVariant(turn_id: number, variant_id: number): boolean {
  const result = getDb().prepare("UPDATE turns SET active_variant_id = ? WHERE id = ?").run(variant_id, turn_id)
  return result.changes > 0
}

export function saveCanceledTurn(story_id: number, payload: CanceledTurnPayload): void {
  getDb()
    .prepare(
      `INSERT INTO canceled_turns (story_id, payload_json)
       VALUES (?, ?)
       ON CONFLICT(story_id) DO UPDATE SET payload_json = excluded.payload_json, canceled_at = datetime('now')`,
    )
    .run(story_id, JSON.stringify(payload))
}

export function getCanceledTurn(story_id: number): CanceledTurnPayload | undefined {
  const row = getDb().prepare("SELECT payload_json FROM canceled_turns WHERE story_id = ?").get(story_id) as
    | { payload_json: string }
    | undefined
  if (!row) return undefined
  try {
    return JSON.parse(row.payload_json) as CanceledTurnPayload
  } catch {
    return undefined
  }
}

export function clearCanceledTurn(story_id: number): void {
  getDb().prepare("DELETE FROM canceled_turns WHERE story_id = ?").run(story_id)
}
