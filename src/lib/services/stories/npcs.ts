import { NPCStateStoredSchema } from "@/engine/core/models"
import * as db from "@/engine/core/db"
import type { StoryNpcGroup } from "@/shared/api-types"
import { hashString } from "@/services/stories/utils"

export async function npcs(): Promise<StoryNpcGroup[]> {
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
