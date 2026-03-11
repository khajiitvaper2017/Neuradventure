import { z } from "zod"
import { desc } from "./field-descriptions.js"

export const PersonalityTraitsSchema = z
  .array(z.string().min(1))
  .min(2)
  .max(5)
  .describe(desc("traits.personality_traits"))
