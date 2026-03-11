import { z } from "zod"
import { desc } from "./field-descriptions.js"

export const PersonalityTraitSchema = z.string().min(1).describe(desc("traits.personality_trait"))

export const PersonalityTraitsSchema = z
  .array(PersonalityTraitSchema)
  .min(2)
  .max(5)
  .describe(desc("traits.personality_traits"))
