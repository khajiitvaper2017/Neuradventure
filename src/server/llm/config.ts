import { readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"
import { dirname, join } from "node:path"
import type { StoryModules } from "../core/models.js"
import { DEFAULT_STORY_MODULES } from "../schemas/story-modules.js"
import { replaceFieldShortcuts } from "../schemas/field-descriptions.js"
import * as db from "../core/db.js"
import type { ModularPrompt, PromptConfig, SectionFormat } from "./prompt-types.js"

// ─── Prompt config (stored in SQLite, seeded from shared/config/prompts/*.json) ──────────

const __dirname = dirname(fileURLToPath(import.meta.url))
export const npcTraits: string[] = JSON.parse(
  readFileSync(join(__dirname, "../../../shared/config/traits.json"), "utf-8"),
)

const DEFAULT_MODULES: StoryModules = { ...DEFAULT_STORY_MODULES }

export function getConfig(): PromptConfig {
  return db.getMergedPromptConfig()
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
  if (blocks?.track_background_events) {
    pushLines(active.track_background_events ? blocks.track_background_events.on : blocks.track_background_events.off)
  }
  if (blocks?.character_appearance_clothing) {
    pushLines(
      active.character_appearance_clothing
        ? blocks.character_appearance_clothing.on
        : blocks.character_appearance_clothing.off,
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
  return db.getSettings().sectionFormat
}
