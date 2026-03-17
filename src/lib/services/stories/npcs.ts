import { MainCharacterStateStoredSchema, NPCStateStoredSchema } from "@/types/models"
import * as db from "@/db/core"
import type { StoryNpcGroup } from "@/types/api"
import { hashString } from "@/services/stories/utils"

export async function npcs(): Promise<StoryNpcGroup[]> {
  const normalizeName = (value: string) => value.trim().toLowerCase()
  const reservedNames = new Set<string>()

  for (const row of db.listCharacters()) {
    const parsed = MainCharacterStateStoredSchema.safeParse(JSON.parse(row.state_json))
    if (!parsed.success) continue
    const { inventory: _inventory, ...base } = parsed.data
    void _inventory
    const key = normalizeName(base.name || "")
    if (key) reservedNames.add(key)
  }

  for (const row of db.listStoriesWithCharacters()) {
    const parsed = MainCharacterStateStoredSchema.safeParse(JSON.parse(row.character_state_json))
    if (!parsed.success) continue
    const { inventory: _inventory, ...base } = parsed.data
    void _inventory
    const key = normalizeName(base.name || "")
    if (key) reservedNames.add(key)
  }

  const rows = db.listStoriesWithNpcs()
  const groups = new Map<string, StoryNpcGroup>()

  for (const row of rows) {
    let raw: unknown
    try {
      raw = JSON.parse(row.npc_states_json)
    } catch {
      continue
    }
    if (!Array.isArray(raw)) continue
    for (const entry of raw) {
      const parsed = NPCStateStoredSchema.safeParse(entry)
      if (!parsed.success) continue
      const { inventory: _inventory, ...base } = parsed.data
      void _inventory
      const nameKey = normalizeName(base.name || "")
      if (nameKey && reservedNames.has(nameKey)) continue
      const keySource = JSON.stringify(base)
      let group = groups.get(keySource)
      if (!group) {
        group = { key: `npc_${hashString(keySource)}`, npc: base, stories: [] }
        groups.set(keySource, group)
      }
      group.stories.push({ id: row.id, title: row.title, updated_at: row.updated_at })
    }
  }

  return Array.from(groups.values())
}
