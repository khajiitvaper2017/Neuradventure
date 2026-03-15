import { z } from "zod"

export const PersonalityTraitSchema = z.string().min(1)

export const PersonalityTraitsSchema = z.array(PersonalityTraitSchema).max(5)
