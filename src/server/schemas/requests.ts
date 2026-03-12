import { z } from "zod"
import { MainCharacterStateSchema, NPCStateSchema, NPCStateStoredSchema } from "./game-state.js"
import { StoryModulesSchema } from "./story-modules.js"
import { DATE_REGEX, TIME_OF_DAY_REGEX } from "./constants.js"

export const CreateCharacterRequestSchema = z.object({
  name: z.string().min(1),
  race: z.string().min(1),
  gender: z.string().min(1),
  general_description: z.string().optional(),
  current_location: z.string().min(1).optional(),
  baseline_appearance: z.string().min(1).optional(),
  current_appearance: z.string().min(1).optional(),
  current_clothing: z.string().min(1).optional(),
  personality_traits: z.array(z.string()).optional(),
  major_flaws: z.array(z.string()).optional(),
  quirks: z.array(z.string()).optional(),
  perks: z.array(z.string()).optional(),
})

export const UpdateCharacterRequestSchema = CreateCharacterRequestSchema.partial()

export const CreateStoryRequestSchema = z.object({
  title: z.string().min(1),
  opening_scenario: z.string().min(1),
  starting_scene: z.string().min(1).optional(),
  starting_date: z.string().regex(DATE_REGEX, "starting_date must be YYYY-MM-DD").optional(),
  starting_time: z.string().regex(TIME_OF_DAY_REGEX, "starting_time must be 24h HH:MM").optional(),
  character_id: z.number().int().optional(),
  character_data: z
    .object({
      name: z.string().min(1),
      race: z.string().min(1),
      gender: z.string().min(1),
      general_description: z.string().optional(),
      current_location: z.string().min(1).optional(),
      baseline_appearance: z.string().min(1).optional(),
      current_appearance: z.string().min(1).optional(),
      current_clothing: z.string().min(1).optional(),
      personality_traits: z.array(z.string()).optional(),
      major_flaws: z.array(z.string()).optional(),
      quirks: z.array(z.string()).optional(),
      perks: z.array(z.string()).optional(),
    })

    .optional(),
  npcs: z.array(NPCStateStoredSchema).optional(),
  story_modules: StoryModulesSchema.optional(),
})

export const UpdateStoryRequestSchema = z.object({
  title: z.string().min(1).optional(),
  opening_scenario: z.string().min(1).optional(),
  story_modules: StoryModulesSchema.optional(),
  author_note: z.string().optional(),
  author_note_depth: z.number().int().min(0).max(100).optional(),
})

export const UpdateStoryStateRequestSchema = z
  .object({
    character: MainCharacterStateSchema.optional(),
    npcs: z.array(NPCStateStoredSchema).optional(),
    world: z
      .object({
        memory: z.string().min(1).optional(),
      })
      .optional(),
  })
  .refine((value) => value.character || value.npcs || value.world, {
    message: "Provide character, npcs, or world updates",
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

const ChatMemberStateSchema = z.union([
  MainCharacterStateSchema.omit({ inventory: true }),
  NPCStateSchema.omit({ inventory: true }),
])

export const CreateChatRequestSchema = z.object({
  title: z.string().optional(),
  scenario: z.string().optional(),
  members: z
    .array(
      z.object({
        role: z.enum(["player", "ai"]),
        member_kind: z.enum(["character", "npc"]),
        character_id: z.number().int().nullable().optional(),
        state: ChatMemberStateSchema,
      }),
    )
    .min(2),
})

export const SendChatMessageRequestSchema = z.object({
  chat_id: z.number().int(),
  content: z.string().min(1),
})

export const UpdateChatRequestSchema = z.object({
  title: z.string().optional(),
  scenario: z.string().optional(),
})

export const UpdateChatMessageRequestSchema = z.object({
  content: z.string().min(1),
})

export const ChatIdRequestSchema = z.object({
  chat_id: z.number().int(),
})

export const SetNextChatSpeakerRequestSchema = z.object({
  chat_id: z.number().int(),
  speaker_member_id: z.number().int(),
})
