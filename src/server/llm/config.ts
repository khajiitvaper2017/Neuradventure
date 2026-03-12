import { readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"

// ─── Prompt config (hot-reloaded from shared/config.json) ────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
export type SectionFormat = "xml" | "markdown" | "equals"

type PromptConfig = {
  systemPromptLines: string[]
  generateCharacterPrompt: string[]
  generateCharacterAppearancePrompt: string[]
  generateCharacterClothingPrompt: string[]
  generateCharacterTraitsPrompt: string[]
  generateStoryPrompt: string[]
  npcCreationPrompt?: string[]
  impersonatePrompt?: string[]
  sectionFormat?: SectionFormat
}

const CONFIG_PATH = join(__dirname, "../../../shared/config.json")
let cachedConfig: PromptConfig | null = null
let cachedConfigMtime = 0

const DEFAULT_IMPERSONATE_PROMPT = [
  "ROLE: You are the player controlling the protagonist in this text-based adventure.",
  "OUTPUT: Return ONLY the player's action text. No labels, no quotes, no extra commentary.",
  "MODE RULES:",
  "- do: short, concrete action the player takes.",
  "- say: return just the dialog line spoken by the player (no quotes, no 'You say').",
  "- story: 1-2 short sentences continuing the story in second-person present tense.",
]

export const npcTraits: string[] = JSON.parse(
  readFileSync(join(__dirname, "../../../shared/traits.json"), "utf-8"),
)

export function getConfig(): PromptConfig {
  const stat = statSync(CONFIG_PATH)
  if (!cachedConfig || stat.mtimeMs !== cachedConfigMtime) {
    cachedConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as PromptConfig
    cachedConfigMtime = stat.mtimeMs
  }
  return cachedConfig
}

export function getSystemPrompt(): string {
  return getConfig().systemPromptLines.join("\n").replace("{npcTraits}", npcTraits.join(", "))
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
  const lines =
    config.impersonatePrompt && config.impersonatePrompt.length > 0
      ? config.impersonatePrompt
      : DEFAULT_IMPERSONATE_PROMPT
  return lines.join("\n")
}

export function getSectionFormat(): SectionFormat {
  return getConfig().sectionFormat ?? "equals"
}
