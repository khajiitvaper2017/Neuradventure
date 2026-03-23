import type { StoryModules } from "@/types/models"
import { DEFAULT_STORY_MODULES } from "@/domain/story/schemas/story-modules"
import { MODULE_DEFS } from "@/domain/story/module-definitions"
import * as db from "@/db/core"
import type { ModularPrompt, PromptConfig, SectionFormat } from "@/llm/prompt-types"
import { npcTraits } from "@/domain/story/schemas/npc-traits"
import { buildLlmContract } from "@/llm/contract"
import { formatTemplate, getLlmStrings } from "@/utils/text/strings"

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
  const llmStrings = getLlmStrings()
  const promptHints = llmStrings.promptHints
  const lines: string[] = []
  if (contract.promptHints.outputShapeLines.length > 0) {
    lines.push(promptHints.outputContractHeader)
    lines.push(...contract.promptHints.outputShapeLines.map((line) => `- ${line}`))
  }
  if (contract.promptHints.enabledPlayerFields.length > 0) {
    lines.push(
      formatTemplate(promptHints.enabledFields.player, { value: contract.promptHints.enabledPlayerFields.join(", ") }),
    )
  }
  if (contract.promptHints.enabledNpcFields.length > 0) {
    lines.push(
      formatTemplate(promptHints.enabledFields.npc, { value: contract.promptHints.enabledNpcFields.join(", ") }),
    )
  }
  if (contract.promptHints.enabledWorldFields.length > 0) {
    lines.push(
      formatTemplate(promptHints.enabledFields.world, { value: contract.promptHints.enabledWorldFields.join(", ") }),
    )
  }
  return lines
}

function appendOutputHygiene(lines: string[]): string[] {
  const promptHints = getLlmStrings().promptHints
  const hygiene = [promptHints.outputHygiene.header, ...promptHints.outputHygiene.rules.map((line) => `- ${line}`)]
  return lines.length > 0 ? [...lines, "", ...hygiene] : hygiene
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
  const joined = appendOutputHygiene([...lines, ...(hint.length > 0 ? ["", ...hint] : [])]).join("\n")
  return joined.replace("{npcTraits}", npcTraits.join(", "))
}

export function getChatPrompt(modules?: StoryModules): string {
  const config = getConfig()
  const lines = resolvePrompt(config.chatPromptLines ?? config.systemPromptLines, modules)
  return appendOutputHygiene(lines).join("\n")
}

export function getNpcCreationPrompt(modules?: StoryModules): string {
  const config = getConfig()
  const lines = resolvePrompt(config.npcCreationPrompt ?? config.systemPromptLines, modules)
  const hint = buildPromptHintLines("character_creation", modules)
  const joined = appendOutputHygiene([...lines, ...(hint.length > 0 ? ["", ...hint] : [])]).join("\n")
  return joined.replace("{npcTraits}", npcTraits.join(", "))
}

export function getImpersonatePrompt(modules?: StoryModules): string {
  const config = getConfig()
  return appendOutputHygiene(resolvePrompt(config.impersonatePrompt ?? config.systemPromptLines, modules)).join("\n")
}

export function getGenerateCharacterPrompt(modules?: StoryModules): string {
  const lines = resolvePrompt(getConfig().generateCharacterPrompt, modules)
  const hint = buildPromptHintLines("character_generation", modules)
  return appendOutputHygiene([...lines, ...(hint.length > 0 ? ["", ...hint] : [])]).join("\n")
}

export function getGenerateStoryPrompt(modules?: StoryModules): string {
  const lines = resolvePrompt(getConfig().generateStoryPrompt, modules)
  const hint = buildPromptHintLines("story_setup", modules)
  return appendOutputHygiene([...lines, ...(hint.length > 0 ? ["", ...hint] : [])]).join("\n")
}

export function getGenerateChatPrompt(modules?: StoryModules): string {
  const config = getConfig()
  const lines = resolvePrompt(config.generateChatPrompt ?? config.generateStoryPrompt, modules)
  return appendOutputHygiene(lines).join("\n")
}

export function getSectionFormat(): SectionFormat {
  return db.getSettings().sectionFormat
}
