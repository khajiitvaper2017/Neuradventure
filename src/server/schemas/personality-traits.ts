import { z } from "zod"

export const PersonalityTraitsSchema = z.array(z.string().min(1)).min(2).max(5)
