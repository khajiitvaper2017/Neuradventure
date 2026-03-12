import { z } from "zod"
import { CharacterAppearanceSchema, MainCharacterStateSchema, NPCStateStoredSchema } from "./game-state.js"
import { desc } from "./field-descriptions.js"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "./constants.js"

export const CreateCharacterRequestSchema = z.object({
  name: z.string().min(1).describe(desc("state.character.name")),
  race: z.string().min(1).describe(desc("state.character.race")),
  gender: z.string().min(1).describe(desc("state.character.gender")),
  current_location: z.string().min(1).describe(desc("state.character.current_location")),
  appearance: CharacterAppearanceSchema.describe(desc("state.character.appearance")),
  personality_traits: z.array(z.string()).describe(desc("traits.personality_traits")),
  major_flaws: z.array(z.string()).describe(desc("traits.major_flaws")),
  quirks: z.array(z.string()).describe(desc("traits.quirks")),
  perks: z.array(z.string()).describe(desc("traits.perks")),
})

export const UpdateCharacterRequestSchema = CreateCharacterRequestSchema.partial()

export const CreateStoryRequestSchema = z.object({
  title: z.string().min(1).describe(desc("requests.story_title")),
  opening_scenario: z.string().min(1).describe(desc("requests.opening_scenario")),
  starting_scene: z.string().min(1).optional().describe(desc("requests.create_story.starting_scene")),
  starting_date: z
    .string()
    .regex(DATE_REGEX, "starting_date must be YYYY-MM-DD")
    .optional()
    .describe(desc("requests.create_story.starting_date")),
  starting_time: z
    .string()
    .regex(TIME_OF_DAY_REGEX, "starting_time must be 24h HH:MM")
    .optional()
    .describe(desc("requests.create_story.starting_time")),
  character_id: z.number().int().optional().describe(desc("requests.create_story.character_id")),
  character_data: z
    .object({
      name: z.string().min(1).describe(desc("state.character.name")),
      race: z.string().min(1).describe(desc("state.character.race")),
      gender: z.string().min(1).describe(desc("state.character.gender")),
      current_location: z.string().min(1).describe(desc("state.character.current_location")),
      appearance: CharacterAppearanceSchema.describe(desc("state.character.appearance")),
      personality_traits: z.array(z.string()).describe(desc("traits.personality_traits")),
      major_flaws: z.array(z.string()).describe(desc("traits.major_flaws")),
      quirks: z.array(z.string()).describe(desc("traits.quirks")),
      perks: z.array(z.string()).describe(desc("traits.perks")),
    })
    .describe(desc("requests.create_story.character_data"))
    .optional(),
  npcs: z.array(NPCStateStoredSchema).optional().describe(desc("requests.create_story.npcs")),
})

export const UpdateStoryRequestSchema = z.object({
  title: z.string().min(1).optional().describe(desc("requests.update_story.title")),
  opening_scenario: z.string().min(1).optional().describe(desc("requests.update_story.opening_scenario")),
  author_note: z.string().optional().describe("Author's note text injected into prompt at specified depth."),
  author_note_depth: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe("Number of history entries from the bottom to inject author's note."),
})

export const UpdateStoryStateRequestSchema = z
  .object({
    character: MainCharacterStateSchema.optional().describe(desc("requests.update_story_state.character")),
    npcs: z.array(NPCStateStoredSchema).optional().describe(desc("requests.update_story_state.npcs")),
    world: z
      .object({
        memory: z.string().min(1).optional().describe(desc("llm.world_state_update.memory")),
      })
      .optional()
      .describe("Partial world state updates."),
  })
  .refine((value) => value.character || value.npcs || value.world, {
    message: "Provide character, npcs, or world updates",
  })

export const UpdateTurnRequestSchema = z.object({
  player_input: z.string().min(1).optional().describe(desc("requests.update_turn.player_input")),
  narrative_text: z.string().min(1).optional().describe(desc("requests.update_turn.narrative_text")),
})

export const TakeTurnRequestSchema = z
  .object({
    story_id: z.number().int().describe(desc("requests.story_id")),
    player_input: z.string().describe(desc("requests.take_turn.player_input")),
    action_mode: z.enum(["do", "say", "story"]).default("do").describe(desc("requests.action_mode")),
    request_id: z.string().min(1).optional().describe(desc("requests.take_turn.request_id")),
  })
  .refine((v) => v.action_mode === "story" || v.player_input.trim().length > 0, {
    message: "player_input is required unless action_mode is story",
  })

export const RegenerateLastRequestSchema = z.object({
  story_id: z.number().int().describe(desc("requests.story_id")),
  action_mode: z.enum(["do", "say", "story"]).optional().describe(desc("requests.regenerate_last.action_mode")),
})

export const ImpersonateRequestSchema = z.object({
  story_id: z.number().int().describe(desc("requests.story_id")),
  action_mode: z.enum(["do", "say", "story"]).default("do").describe(desc("requests.action_mode")),
})

export const CancelLastRequestSchema = z.object({
  story_id: z.number().int().describe(desc("requests.story_id")),
})

export const UndoCancelRequestSchema = z.object({
  story_id: z.number().int().describe(desc("requests.story_id")),
})

export const SelectTurnVariantRequestSchema = z.object({
  variant_id: z.number().int().describe(desc("requests.select_turn_variant.variant_id")),
})
