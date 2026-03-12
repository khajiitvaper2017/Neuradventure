import { readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import type { StoryModules } from "../core/models.js"
// ─── Prompt config (hot-reloaded from shared/config/prompts/*.json) ──────────

const __dirname = dirname(fileURLToPath(import.meta.url))
export type SectionFormat = "xml" | "markdown" | "equals"

type PromptModuleBlock = {
  on?: string[]
  off?: string[]
}

type PromptDetailBlock = {
  detailed?: string[]
  general?: string[]
}

type PromptModules = {
  track_npcs?: PromptModuleBlock
  track_locations?: PromptModuleBlock
  character_detail_mode?: PromptDetailBlock
}

type ModularPrompt = {
  base: string[]
  modules?: PromptModules
}

type PromptConfig = {
  systemPromptLines: ModularPrompt
  generateCharacterPrompt: ModularPrompt
  generateStoryPrompt: ModularPrompt
  generateChatPrompt?: ModularPrompt
  chatPromptLines?: ModularPrompt
  npcCreationPrompt?: ModularPrompt
  impersonatePrompt?: ModularPrompt
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

const DEFAULT_MODULES: StoryModules = {
  track_npcs: true,
  track_locations: true,
  character_detail_mode: "detailed",
}

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

function resolvePrompt(prompt: ModularPrompt | undefined, modules?: StoryModules): string[] {
  if (!prompt) return []
  const active = modules ?? DEFAULT_MODULES
  const lines = [...(prompt.base ?? [])]
  const blocks = prompt.modules
  if (blocks?.track_npcs) {
    lines.push(...(active.track_npcs ? (blocks.track_npcs.on ?? []) : (blocks.track_npcs.off ?? [])))
  }
  if (blocks?.track_locations) {
    lines.push(...(active.track_locations ? (blocks.track_locations.on ?? []) : (blocks.track_locations.off ?? [])))
  }
  if (blocks?.character_detail_mode) {
    lines.push(
      ...(active.character_detail_mode === "general"
        ? (blocks.character_detail_mode.general ?? [])
        : (blocks.character_detail_mode.detailed ?? [])),
    )
  }
  return lines
}

export function getSystemPrompt(modules?: StoryModules): string {
  return resolvePrompt(getConfig().systemPromptLines, modules).join("\n").replace("{npcTraits}", npcTraits.join(", "))
}

export function getChatPrompt(modules?: StoryModules): string {
  const config = getConfig()
  const lines = resolvePrompt(config.chatPromptLines ?? config.systemPromptLines, modules)
  return lines.join("\n")
}

export function getNpcCreationPrompt(modules?: StoryModules): string {
  const config = getConfig()
  const lines = resolvePrompt(config.npcCreationPrompt ?? config.systemPromptLines, modules)
  return lines.join("\n").replace("{npcTraits}", npcTraits.join(", "))
}

export function getImpersonatePrompt(modules?: StoryModules): string {
  const config = getConfig()
  return resolvePrompt(config.impersonatePrompt ?? config.systemPromptLines, modules).join("\n")
}

export function getGenerateCharacterPrompt(modules?: StoryModules): string {
  return resolvePrompt(getConfig().generateCharacterPrompt, modules).join("\n")
}

export function getGenerateStoryPrompt(modules?: StoryModules): string {
  return resolvePrompt(getConfig().generateStoryPrompt, modules).join("\n")
}

export function getGenerateChatPrompt(modules?: StoryModules): string {
  const config = getConfig()
  const lines = resolvePrompt(config.generateChatPrompt ?? config.generateStoryPrompt, modules)
  return lines.join("\n")
}

export function getSectionFormat(): SectionFormat {
  return getConfig().sectionFormat ?? "equals"
}
