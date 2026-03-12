import { z } from "zod"
const npcStateUpdateShape = {
  name: z.string().min(1),
  race: z.string().min(1).optional(),
  gender: z.string().min(1).optional(),
  set_current_activity: z.string().min(1).optional(),
  current_location: z.string().min(1).optional(),
  current_clothing: z.string().min(1).optional(),
  current_appearance: z.string().min(1).optional(),
}

export const NPCStateUpdateBaseSchema = z.object(npcStateUpdateShape).strict()
