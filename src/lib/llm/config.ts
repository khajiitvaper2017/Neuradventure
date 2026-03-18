import type { StoryModules } from "@/types/models"
import { DEFAULT_STORY_MODULES } from "@/domain/story/schemas/story-modules"
import { MODULE_DEFS } from "@/domain/story/module-definitions"
import * as db from "@/db/core"
import type { ModularPrompt, PromptConfig, SectionFormat } from "@/llm/prompt-types"
import { npcTraits } from "@/domain/story/schemas/npc-traits"
import { buildLlmContract } from "@/llm/contract"

// ─── Prompt config (stored in SQLite, seeded from shared/config/prompts/*.txt) ──────────

export { npcTraits }

export function getConfig(): PromptConfig {
  return db.getMergedPromptConfig()
}

function buildPromptHintLines(
  kind: "turn" | "story_setup" | "character_generation" | "character_creation",
  modules?: StoryModules,
): string[] {
  const contract = buildLlmContract(kind, {
    modules,
    playerName: kind === "turn" || kind === "story_setup" ? "Player" : undefined,
  })
  const lines: string[] = []
  if (contract.promptHints.outputShapeLines.length > 0) {
    lines.push("Output contract:")
    lines.push(...contract.promptHints.outputShapeLines.map((line) => `- ${line}`))
  }
  if (contract.promptHints.enabledPlayerFields.length > 0) {
    lines.push(`Enabled player fields: ${contract.promptHints.enabledPlayerFields.join(", ")}`)
  }
  if (contract.promptHints.enabledNpcFields.length > 0) {
    lines.push(`Enabled NPC fields: ${contract.promptHints.enabledNpcFields.join(", ")}`)
  }
  if (contract.promptHints.enabledWorldFields.length > 0) {
    lines.push(`Enabled world fields: ${contract.promptHints.enabledWorldFields.join(", ")}`)
  }
  return lines
}

function resolvePrompt(prompt: ModularPrompt | undefined, modules?: StoryModules): string[] {
  if (!prompt) return []
  const active = modules ?? DEFAULT_STORY_MODULES
  const lines = [...(prompt.base ?? [])]
  const blocks = (prompt.modules ?? {}) as Record<string, { on?: string[]; off?: string[] } | undefined>
  const pushLines = (items?: string[]) => {
    if (!items || items.length === 0) return
    lines.push(...items)
  }
  for (const def of MODULE_DEFS) {
    const block = blocks[def.id]
    if (!block) continue
    pushLines(active[def.id] ? block.on : block.off)
  }
  return lines
}

export function getSystemPrompt(modules?: StoryModules): string {
  const lines = resolvePrompt(getConfig().systemPromptLines, modules)
  const hint = buildPromptHintLines("turn", modules)
  const joined = [...lines, ...(hint.length > 0 ? ["", ...hint] : [])].join("\n")
  return joined.replace("{npcTraits}", npcTraits.join(", "))
}

export function getChatPrompt(modules?: StoryModules): string {
  const config = getConfig()
  const lines = resolvePrompt(config.chatPromptLines ?? config.systemPromptLines, modules)
  return lines.join("\n")
}

export function getNpcCreationPrompt(modules?: StoryModules): string {
  const config = getConfig()
  const lines = resolvePrompt(config.npcCreationPrompt ?? config.systemPromptLines, modules)
  const hint = buildPromptHintLines("character_creation", modules)
  const joined = [...lines, ...(hint.length > 0 ? ["", ...hint] : [])].join("\n")
  return joined.replace("{npcTraits}", npcTraits.join(", "))
}

export function getImpersonatePrompt(modules?: StoryModules): string {
  const config = getConfig()
  return resolvePrompt(config.impersonatePrompt ?? config.systemPromptLines, modules).join("\n")
}

export function getGenerateCharacterPrompt(modules?: StoryModules): string {
  const lines = resolvePrompt(getConfig().generateCharacterPrompt, modules)
  const hint = buildPromptHintLines("character_generation", modules)
  return [...lines, ...(hint.length > 0 ? ["", ...hint] : [])].join("\n")
}

export function getGenerateStoryPrompt(modules?: StoryModules): string {
  const lines = resolvePrompt(getConfig().generateStoryPrompt, modules)
  const hint = buildPromptHintLines("story_setup", modules)
  return [...lines, ...(hint.length > 0 ? ["", ...hint] : [])].join("\n")
}

export function getGenerateChatPrompt(modules?: StoryModules): string {
  const config = getConfig()
  const lines = resolvePrompt(config.generateChatPrompt ?? config.generateStoryPrompt, modules)
  return lines.join("\n")
}

export function getSectionFormat(): SectionFormat {
  return db.getSettings().sectionFormat
}
