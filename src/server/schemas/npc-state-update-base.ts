import { z } from "zod"
import { desc } from "./field-descriptions.js"
const npcStateUpdateShape = {
  name: z.string().min(1).describe(desc("llm.npc_update.name")),
  race: z.string().min(1).optional().describe(desc("llm.npc_update.race")),
  gender: z.string().min(1).optional().describe(desc("llm.npc_update.gender")),
  set_location: z.string().min(1).optional().describe(desc("llm.npc_update.set_location")),
  set_appearance: z.string().min(1).optional().describe(desc("llm.npc_update.set_appearance")),
  set_clothing: z.string().min(1).optional().describe(desc("llm.npc_update.set_clothing")),
  set_relationship: z.string().min(1).optional().describe(desc("llm.npc_update.set_relationship")),
  set_notes: z.string().min(1).optional().describe(desc("llm.npc_update.set_notes")),
}

export const NPCStateUpdateBaseSchema = z.object(npcStateUpdateShape).strict()
