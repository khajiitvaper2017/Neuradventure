import { readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
// ─── Prompt config (hot-reloaded from shared/config/prompts/*.json) ──────────

const __dirname = dirname(fileURLToPath(import.meta.url))
export type SectionFormat = "xml" | "markdown" | "equals"

type PromptConfig = {
  systemPromptLines: string[]
  generateCharacterPrompt: string[]
  generateCharacterAppearancePrompt: string[]
  generateCharacterClothingPrompt: string[]
  generateCharacterTraitsPrompt: string[]
  generateStoryPrompt: string[]
  generateChatPrompt?: string[]
  chatPromptLines?: string[]
  npcCreationPrompt?: string[]
  impersonatePrompt?: string[]
  sectionFormat?: SectionFormat
}

const PROMPT_FILES = [
  join(__dirname, "../../../shared/config/prompts/system.json"),
  join(__dirname, "../../../shared/config/prompts/character.json"),
  join(__dirname, "../../../shared/config/prompts/story.json"),
  join(__dirname, "../../../shared/config/prompts/chat.json"),
  join(__dirname, "../../../shared/config/prompts/npc.json"),
  join(__dirname, "../../../shared/config/prompts/impersonate.json"),
]
let cachedConfig: PromptConfig | null = null
let cachedConfigMtime = 0

export const npcTraits: string[] = JSON.parse(
  readFileSync(join(__dirname, "../../../shared/config/traits.json"), "utf-8"),
)

function readPromptConfig(): PromptConfig {
  const merged: Partial<PromptConfig> = {}
  for (const file of PROMPT_FILES) {
    const payload = JSON.parse(readFileSync(file, "utf-8")) as Partial<PromptConfig>
    Object.assign(merged, payload)
  }
  return merged as PromptConfig
}

export function getConfig(): PromptConfig {
  let latestMtime = 0
  for (const file of PROMPT_FILES) {
    const stat = statSync(file)
    if (stat.mtimeMs > latestMtime) latestMtime = stat.mtimeMs
  }
  if (!cachedConfig || latestMtime !== cachedConfigMtime) {
    cachedConfig = readPromptConfig()
    cachedConfigMtime = latestMtime
  }
  return cachedConfig
}

export function getSystemPrompt(): string {
  return getConfig().systemPromptLines.join("\n").replace("{npcTraits}", npcTraits.join(", "))
}

export function getChatPrompt(): string {
  const config = getConfig()
  return (config.chatPromptLines ?? config.systemPromptLines).join("\n")
}

export function getNpcCreationPrompt(): string {
  const config = getConfig()
  const lines =
    config.npcCreationPrompt && config.npcCreationPrompt.length > 0
      ? config.npcCreationPrompt
      : config.systemPromptLines
  return lines.join("\n").replace("{npcTraits}", npcTraits.join(", "))
}

export function getImpersonatePrompt(): string {
  const config = getConfig()
  return (config.impersonatePrompt ?? config.systemPromptLines).join("\n")
}

export function getSectionFormat(): SectionFormat {
  return getConfig().sectionFormat ?? "equals"
}
