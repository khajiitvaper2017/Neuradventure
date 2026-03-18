import { z } from "zod"
import { STORY_MODULE_KEYS } from "@/domain/story/module-definitions"

export type SectionFormat = "xml" | "markdown" | "equals" | "bbcode" | "colon" | "none"

export const PromptModuleBlockSchema = z
  .object({
    on: z.array(z.string()).optional(),
    off: z.array(z.string()).optional(),
  })
  .passthrough()

const promptModuleShape = Object.fromEntries(
  STORY_MODULE_KEYS.map((key) => [key, PromptModuleBlockSchema.optional()]),
) as Record<string, z.ZodTypeAny>

export const PromptModulesSchema = z.object(promptModuleShape).passthrough()

export const ModularPromptSchema = z
  .object({
    base: z.array(z.string()),
    modules: PromptModulesSchema.optional(),
  })
  .passthrough()

export const SectionFormatSchema = z.enum(["xml", "markdown", "equals", "bbcode", "colon", "none"])

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
export type ModularPrompt = z.infer<typeof ModularPromptSchema>
export type PromptConfig = z.infer<typeof PromptConfigSchema>
