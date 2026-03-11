import { z } from "zod"
const npcStateUpdateShape = {
  name: z.string().min(1),
  race: z.string().min(1).optional(),
  gender: z.string().min(1).optional(),
  set_location: z.string().min(1).optional(),
  set_appearance: z.string().min(1).optional(),
  set_clothing: z.string().min(1).optional(),
  set_relationship: z.string().min(1).optional(),
  set_notes: z.string().min(1).optional(),
}

export const NPCStateUpdateBaseSchema = z.object(npcStateUpdateShape).strict()
