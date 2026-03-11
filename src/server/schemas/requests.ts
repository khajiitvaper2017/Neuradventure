import { z } from "zod"
import {
  CharacterAppearanceSchema,
  MainCharacterStateSchema,
  NPCStateSchema,
  NPCStateStoredSchema,
} from "./game-state.js"
import { desc } from "./field-descriptions.js"

export const CreateCharacterRequestSchema = z.object({
  name: z.string().min(1).describe(desc("requests.create_character.name")),
  race: z.string().min(1).describe(desc("requests.create_character.race")),
  gender: z.string().min(1).describe(desc("requests.create_character.gender")),
  appearance: CharacterAppearanceSchema.describe(desc("requests.create_character.appearance")),
  personality_traits: z.array(z.string()).describe(desc("requests.create_character.personality_traits")),
  custom_traits: z.array(z.string()).describe(desc("requests.create_character.custom_traits")),
})

export const UpdateCharacterRequestSchema = CreateCharacterRequestSchema.partial()

export const CreateStoryRequestSchema = z.object({
  title: z.string().min(1).describe(desc("requests.create_story.title")),
  opening_scenario: z.string().min(1).describe(desc("requests.create_story.opening_scenario")),
  starting_scene: z.string().min(1).optional().describe(desc("requests.create_story.starting_scene")),
  character_id: z.number().int().optional().describe(desc("requests.create_story.character_id")),
  character_data: z
    .object({
      name: z.string().min(1).describe(desc("requests.create_story_character.name")),
      race: z.string().min(1).describe(desc("requests.create_story_character.race")),
      gender: z.string().min(1).describe(desc("requests.create_story_character.gender")),
      appearance: CharacterAppearanceSchema.describe(desc("requests.create_story_character.appearance")),
      personality_traits: z.array(z.string()).describe(desc("requests.create_story_character.personality_traits")),
      custom_traits: z.array(z.string()).describe(desc("requests.create_story_character.custom_traits")),
    })
    .describe(desc("requests.create_story.character_data"))
    .optional(),
  npcs: z.array(NPCStateSchema).optional().describe(desc("requests.create_story.npcs")),
})

export const UpdateStoryRequestSchema = z.object({
  title: z.string().min(1).optional().describe(desc("requests.update_story.title")),
  opening_scenario: z.string().min(1).optional().describe(desc("requests.update_story.opening_scenario")),
})

export const UpdateStoryStateRequestSchema = z
  .object({
    character: MainCharacterStateSchema.optional().describe(desc("requests.update_story_state.character")),
    npcs: z.array(NPCStateStoredSchema).optional().describe(desc("requests.update_story_state.npcs")),
  })
  .refine((value) => value.character || value.npcs, {
    message: "Provide character or npcs updates",
  })

export const UpdateTurnRequestSchema = z.object({
  player_input: z.string().min(1).optional().describe(desc("requests.update_turn.player_input")),
  narrative_text: z.string().min(1).optional().describe(desc("requests.update_turn.narrative_text")),
})

export const TakeTurnRequestSchema = z
  .object({
    story_id: z.number().int().describe(desc("requests.take_turn.story_id")),
    player_input: z.string().describe(desc("requests.take_turn.player_input")),
    action_mode: z.enum(["do", "say", "story"]).default("do").describe(desc("requests.take_turn.action_mode")),
    request_id: z.string().min(1).optional().describe(desc("requests.take_turn.request_id")),
  })
  .refine((v) => v.action_mode === "story" || v.player_input.trim().length > 0, {
    message: "player_input is required unless action_mode is story",
  })

export const RegenerateLastRequestSchema = z.object({
  story_id: z.number().int().describe(desc("requests.regenerate_last.story_id")),
  action_mode: z.enum(["do", "say", "story"]).optional().describe(desc("requests.regenerate_last.action_mode")),
})

export const ImpersonateRequestSchema = z.object({
  story_id: z.number().int().describe(desc("requests.impersonate.story_id")),
  action_mode: z.enum(["do", "say", "story"]).default("do").describe(desc("requests.impersonate.action_mode")),
})

export const CancelLastRequestSchema = z.object({
  story_id: z.number().int().describe(desc("requests.cancel_last.story_id")),
})

export const UndoCancelRequestSchema = z.object({
  story_id: z.number().int().describe(desc("requests.undo_cancel.story_id")),
})

export const SelectTurnVariantRequestSchema = z.object({
  variant_id: z.number().int().describe(desc("requests.select_turn_variant.variant_id")),
})
