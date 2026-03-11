import { z } from "zod"
import {
  CharacterAppearanceSchema,
  MainCharacterStateSchema,
  NPCStateSchema,
  NPCStateStoredSchema,
} from "./game-state.js"

export const CreateCharacterRequestSchema = z.object({
  name: z.string().min(1),
  race: z.string().min(1),
  gender: z.string().min(1),
  appearance: CharacterAppearanceSchema,
  personality_traits: z.array(z.string()),
  custom_traits: z.array(z.string()),
})

export const UpdateCharacterRequestSchema = CreateCharacterRequestSchema.partial()

export const CreateStoryRequestSchema = z.object({
  title: z.string().min(1),
  opening_scenario: z.string().min(1),
  starting_scene: z.string().min(1).optional(),
  character_id: z.number().int().optional(),
  character_data: z
    .object({
      name: z.string().min(1),
      race: z.string().min(1),
      gender: z.string().min(1),
      appearance: CharacterAppearanceSchema,
      personality_traits: z.array(z.string()),
      custom_traits: z.array(z.string()),
    })
    .optional(),
  npcs: z.array(NPCStateSchema).optional(),
})

export const UpdateStoryRequestSchema = z.object({
  title: z.string().min(1).optional(),
  opening_scenario: z.string().min(1).optional(),
})

export const UpdateStoryStateRequestSchema = z
  .object({
    character: MainCharacterStateSchema.optional(),
    npcs: z.array(NPCStateStoredSchema).optional(),
  })
  .refine((value) => value.character || value.npcs, {
    message: "Provide character or npcs updates",
  })

export const UpdateTurnRequestSchema = z.object({
  player_input: z.string().min(1).optional(),
  narrative_text: z.string().min(1).optional(),
})

export const TakeTurnRequestSchema = z
  .object({
    story_id: z.number().int(),
    player_input: z.string(),
    action_mode: z.enum(["do", "say", "story"]).default("do"),
    request_id: z.string().min(1).optional(),
  })
  .refine((v) => v.action_mode === "story" || v.player_input.trim().length > 0, {
    message: "player_input is required unless action_mode is story",
  })

export const RegenerateLastRequestSchema = z.object({
  story_id: z.number().int(),
  action_mode: z.enum(["do", "say", "story"]).optional(),
})

export const ImpersonateRequestSchema = z.object({
  story_id: z.number().int(),
  action_mode: z.enum(["do", "say", "story"]).default("do"),
})

export const CancelLastRequestSchema = z.object({
  story_id: z.number().int(),
})

export const UndoCancelRequestSchema = z.object({
  story_id: z.number().int(),
})

export const SelectTurnVariantRequestSchema = z.object({
  variant_id: z.number().int(),
})
