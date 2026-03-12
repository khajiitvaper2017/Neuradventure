import { readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import type { StoryModules } from "../core/models.js"
import { DEFAULT_STORY_MODULES } from "../schemas/story-modules.js"
import { replaceFieldShortcuts } from "../schemas/field-descriptions.js"
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
  character_personality_traits?: PromptModuleBlock
  character_major_flaws?: PromptModuleBlock
  character_quirks?: PromptModuleBlock
  character_perks?: PromptModuleBlock
  character_inventory?: PromptModuleBlock
  npc_appearance_clothing?: PromptModuleBlock
  npc_personality_traits?: PromptModuleBlock
  npc_major_flaws?: PromptModuleBlock
  npc_quirks?: PromptModuleBlock
  npc_perks?: PromptModuleBlock
  npc_location?: PromptModuleBlock
  npc_activity?: PromptModuleBlock
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
  join(__dirname, "../../../shared/config/prompts/narrative-turn.json"),
  join(__dirname, "../../../shared/config/prompts/character-generation.json"),
  join(__dirname, "../../../shared/config/prompts/story-setup.json"),
  join(__dirname, "../../../shared/config/prompts/chat-mode.json"),
  join(__dirname, "../../../shared/config/prompts/npc-creation.json"),
  join(__dirname, "../../../shared/config/prompts/player-impersonation.json"),
]
let cachedConfig: PromptConfig | null = null
let cachedConfigMtime = 0

export const npcTraits: string[] = JSON.parse(
  readFileSync(join(__dirname, "../../../shared/config/traits.json"), "utf-8"),
)

const DEFAULT_MODULES: StoryModules = { ...DEFAULT_STORY_MODULES }

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
  const lines = [...(prompt.base ?? [])].map(replaceFieldShortcuts)
  const blocks = prompt.modules
  const pushLines = (items?: string[]) => {
    if (!items || items.length === 0) return
    lines.push(...items.map(replaceFieldShortcuts))
  }
  if (blocks?.track_npcs) {
    pushLines(active.track_npcs ? blocks.track_npcs.on : blocks.track_npcs.off)
  }
  if (blocks?.track_locations) {
    pushLines(active.track_locations ? blocks.track_locations.on : blocks.track_locations.off)
  }
  if (blocks?.character_detail_mode) {
    pushLines(
      active.character_detail_mode === "general"
        ? blocks.character_detail_mode.general
        : blocks.character_detail_mode.detailed,
    )
  }
  if (blocks?.character_personality_traits) {
    pushLines(
      active.character_personality_traits
        ? blocks.character_personality_traits.on
        : blocks.character_personality_traits.off,
    )
  }
  if (blocks?.character_major_flaws) {
    pushLines(active.character_major_flaws ? blocks.character_major_flaws.on : blocks.character_major_flaws.off)
  }
  if (blocks?.character_quirks) {
    pushLines(active.character_quirks ? blocks.character_quirks.on : blocks.character_quirks.off)
  }
  if (blocks?.character_perks) {
    pushLines(active.character_perks ? blocks.character_perks.on : blocks.character_perks.off)
  }
  if (blocks?.character_inventory) {
    pushLines(active.character_inventory ? blocks.character_inventory.on : blocks.character_inventory.off)
  }
  if (blocks?.npc_appearance_clothing) {
    pushLines(active.npc_appearance_clothing ? blocks.npc_appearance_clothing.on : blocks.npc_appearance_clothing.off)
  }
  if (blocks?.npc_personality_traits) {
    pushLines(active.npc_personality_traits ? blocks.npc_personality_traits.on : blocks.npc_personality_traits.off)
  }
  if (blocks?.npc_major_flaws) {
    pushLines(active.npc_major_flaws ? blocks.npc_major_flaws.on : blocks.npc_major_flaws.off)
  }
  if (blocks?.npc_quirks) {
    pushLines(active.npc_quirks ? blocks.npc_quirks.on : blocks.npc_quirks.off)
  }
  if (blocks?.npc_perks) {
    pushLines(active.npc_perks ? blocks.npc_perks.on : blocks.npc_perks.off)
  }
  if (blocks?.npc_location) {
    pushLines(active.npc_location ? blocks.npc_location.on : blocks.npc_location.off)
  }
  if (blocks?.npc_activity) {
    pushLines(active.npc_activity ? blocks.npc_activity.on : blocks.npc_activity.off)
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
