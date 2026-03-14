import { z } from "zod"

export type SectionFormat = "xml" | "markdown" | "equals"

export const PromptModuleBlockSchema = z
  .object({
    on: z.array(z.string()).optional(),
    off: z.array(z.string()).optional(),
  })
  .passthrough()

export const PromptModulesSchema = z
  .object({
    track_npcs: PromptModuleBlockSchema.optional(),
    track_locations: PromptModuleBlockSchema.optional(),
    track_background_events: PromptModuleBlockSchema.optional(),
    character_appearance_clothing: PromptModuleBlockSchema.optional(),
    character_personality_traits: PromptModuleBlockSchema.optional(),
    character_major_flaws: PromptModuleBlockSchema.optional(),
    character_quirks: PromptModuleBlockSchema.optional(),
    character_perks: PromptModuleBlockSchema.optional(),
    character_inventory: PromptModuleBlockSchema.optional(),
    npc_appearance_clothing: PromptModuleBlockSchema.optional(),
    npc_personality_traits: PromptModuleBlockSchema.optional(),
    npc_major_flaws: PromptModuleBlockSchema.optional(),
    npc_quirks: PromptModuleBlockSchema.optional(),
    npc_perks: PromptModuleBlockSchema.optional(),
    npc_location: PromptModuleBlockSchema.optional(),
    npc_activity: PromptModuleBlockSchema.optional(),
  })
  .passthrough()

export const ModularPromptSchema = z
  .object({
    base: z.array(z.string()),
    modules: PromptModulesSchema.optional(),
  })
  .passthrough()

export const SectionFormatSchema = z.enum(["xml", "markdown", "equals"])

export const PromptConfigSchema = z
  .object({
    systemPromptLines: ModularPromptSchema,
    generateCharacterPrompt: ModularPromptSchema,
    generateStoryPrompt: ModularPromptSchema,
    generateChatPrompt: ModularPromptSchema.optional(),
    chatPromptLines: ModularPromptSchema.optional(),
    npcCreationPrompt: ModularPromptSchema.optional(),
    impersonatePrompt: ModularPromptSchema.optional(),
    sectionFormat: SectionFormatSchema.optional(),
  })
  .passthrough()

export type PromptModuleBlock = z.infer<typeof PromptModuleBlockSchema>
export type PromptModules = z.infer<typeof PromptModulesSchema>
export type ModularPrompt = z.infer<typeof ModularPromptSchema>
export type PromptConfig = z.infer<typeof PromptConfigSchema>
