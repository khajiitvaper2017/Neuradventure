import { z } from "zod"
import { desc } from "./field-descriptions.js"
const npcStateUpdateShape = {
  name: z.string().min(1).describe(desc("llm.npc_update.name")),
  race: z.string().min(1).optional().describe(desc("llm.npc_update.race")),
  gender: z.string().min(1).optional().describe(desc("llm.npc_update.gender")),
  set_current_location: z.string().min(1).optional().describe(desc("llm.npc_update.set_current_location")),
  set_current_appearance: z.string().min(1).optional().describe(desc("llm.npc_update.set_current_appearance")),
  set_current_clothing: z.string().min(1).optional().describe(desc("state.appearance.current_clothing")),
  set_current_activity: z.string().min(1).optional().describe(desc("llm.npc_update.set_current_activity")),
}

export const NPCStateUpdateBaseSchema = z.object(npcStateUpdateShape).strict()
