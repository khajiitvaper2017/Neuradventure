import { z } from "zod"
import { getDb } from "@/db/connection"
import { PromptConfigSchema, type PromptConfig } from "@/llm/prompt-types"

import narrativeTurnText from "@/config/prompts/narrative-turn.txt?raw"
import characterGenerationText from "@/config/prompts/character-generation.txt?raw"
import storySetupText from "@/config/prompts/story-setup.txt?raw"
import chatPromptLinesText from "@/config/prompts/chat-prompt-lines.txt?raw"
import chatSetupText from "@/config/prompts/chat-setup.txt?raw"
import npcCreationText from "@/config/prompts/npc-creation.txt?raw"
import playerImpersonationText from "@/config/prompts/player-impersonation.txt?raw"

function normalizeTemplateText(text: string): string {
  const normalized = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n")
  // Avoid producing an extra trailing empty line from the common "final newline" convention.
  return normalized.endsWith("\n") ? normalized.slice(0, -1) : normalized
}

function splitTemplateText(text: string): string[] {
  const normalized = normalizeTemplateText(text)
  return normalized.length > 0 ? normalized.split("\n") : []
}

const PROMPT_TEMPLATE_SOURCES = [
  { name: "narrative-turn", defaultText: narrativeTurnText },
  { name: "character-generation", defaultText: characterGenerationText },
  { name: "story-setup", defaultText: storySetupText },
  { name: "chat-prompt-lines", defaultText: chatPromptLinesText },
  { name: "chat-setup", defaultText: chatSetupText },
  { name: "npc-creation", defaultText: npcCreationText },
  { name: "player-impersonation", defaultText: playerImpersonationText },
] as const

export type PromptTemplateKey = (typeof PROMPT_TEMPLATE_SOURCES)[number]["name"]
export const PROMPT_TEMPLATE_KEYS = PROMPT_TEMPLATE_SOURCES.map((x) => x.name) as PromptTemplateKey[]

const PromptTemplateKeySchema = z.enum(PROMPT_TEMPLATE_KEYS as unknown as [PromptTemplateKey, ...PromptTemplateKey[]])

function nowSql(): string {
  return "strftime('%Y-%m-%dT%H:%M:%fZ','now')"
}

function getSourceFor(name: PromptTemplateKey): { defaultText: string } {
  const src = PROMPT_TEMPLATE_SOURCES.find((x) => x.name === name)
  if (!src) throw new Error(`Unknown prompt config: ${name}`)
  return src
}

function getDefaultTemplateText(name: PromptTemplateKey): string {
  return normalizeTemplateText(getSourceFor(name).defaultText)
}

function partialConfigFor(name: PromptTemplateKey, lines: string[]): Record<string, unknown> {
  if (name === "narrative-turn") return { systemPromptLines: { base: lines } }
  if (name === "character-generation") return { generateCharacterPrompt: { base: lines } }
  if (name === "story-setup") return { generateStoryPrompt: { base: lines } }
  if (name === "chat-prompt-lines") return { chatPromptLines: { base: lines } }
  if (name === "chat-setup") return { generateChatPrompt: { base: lines } }
  if (name === "npc-creation") return { npcCreationPrompt: { base: lines } }
  if (name === "player-impersonation") return { impersonatePrompt: { base: lines } }
  return {}
}

export function ensurePromptTemplateDefaults(): void {
  const database = getDb()
  const upsert = database.prepare(
    `INSERT INTO prompt_configs (name, config_json, updated_at)
     VALUES (?, ?, ${nowSql()})
     ON CONFLICT(name) DO NOTHING`,
  )
  for (const name of PROMPT_TEMPLATE_KEYS) {
    upsert.run(name, getDefaultTemplateText(name))
  }
}

export type PromptTemplateFileRow = {
  name: PromptTemplateKey
  template_text: string
  updated_at: string
}

export function listPromptTemplateFiles(): PromptTemplateFileRow[] {
  ensurePromptTemplateDefaults()
  const database = getDb()
  const get = database.prepare("SELECT name, config_json, updated_at FROM prompt_configs WHERE name = ?")
  const out: PromptTemplateFileRow[] = []
  for (const name of PROMPT_TEMPLATE_KEYS) {
    const row = get.get(name) as { name: PromptTemplateKey; config_json: string; updated_at: string } | undefined
    if (!row) {
      out.push({ name, template_text: getDefaultTemplateText(name), updated_at: "" })
      continue
    }
    out.push({ name: row.name, template_text: String(row.config_json ?? ""), updated_at: row.updated_at })
  }
  return out
}

function mergePromptTemplateFiles(files: Record<PromptTemplateKey, string>): PromptConfig {
  const merged: Record<string, unknown> = {}
  for (const name of PROMPT_TEMPLATE_KEYS) {
    const templateText = files[name]
    const lines = splitTemplateText(templateText)
    Object.assign(merged, partialConfigFor(name, lines))
  }
  return PromptConfigSchema.parse(merged)
}

function loadPromptTemplateFilesFromDb(): Record<PromptTemplateKey, string> {
  ensurePromptTemplateDefaults()
  const database = getDb()
  const get = database.prepare("SELECT config_json FROM prompt_configs WHERE name = ?")
  const out = {} as Record<PromptTemplateKey, string>
  for (const name of PROMPT_TEMPLATE_KEYS) {
    const row = get.get(name) as { config_json: string } | undefined
    out[name] = typeof row?.config_json === "string" ? String(row.config_json) : getDefaultTemplateText(name)
  }
  return out
}

let cachedConfig: PromptConfig | null = null
let cachedMaxUpdatedAt = ""

export function getMergedPromptConfig(): PromptConfig {
  const database = getDb()
  const maxRow = database.prepare("SELECT MAX(updated_at) as max_updated_at FROM prompt_configs").get() as
    | { max_updated_at: string | null }
    | undefined
  const maxUpdatedAt = maxRow?.max_updated_at ?? ""
  if (cachedConfig && maxUpdatedAt && maxUpdatedAt === cachedMaxUpdatedAt) return cachedConfig

  const files = loadPromptTemplateFilesFromDb()
  try {
    cachedConfig = mergePromptTemplateFiles(files)
    cachedMaxUpdatedAt = maxUpdatedAt
    return cachedConfig
  } catch {
    const disk: Record<PromptTemplateKey, string> = {} as Record<PromptTemplateKey, string>
    for (const name of PROMPT_TEMPLATE_KEYS) disk[name] = getDefaultTemplateText(name)
    cachedConfig = mergePromptTemplateFiles(disk)
    cachedMaxUpdatedAt = maxUpdatedAt
    return cachedConfig
  }
}

export function updatePromptTemplateFile(nameRaw: string, templateText: string): PromptTemplateFileRow {
  const name = PromptTemplateKeySchema.parse(nameRaw)
  const nextText = normalizeTemplateText(templateText)

  const existing = loadPromptTemplateFilesFromDb()
  existing[name] = nextText
  mergePromptTemplateFiles(existing)

  const database = getDb()
  database
    .prepare(
      `INSERT INTO prompt_configs (name, config_json, updated_at)
       VALUES (?, ?, ${nowSql()})
       ON CONFLICT(name) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
    )
    .run(name, nextText)

  cachedConfig = null
  cachedMaxUpdatedAt = ""

  const row = database.prepare("SELECT name, config_json, updated_at FROM prompt_configs WHERE name = ?").get(name) as
    | { name: PromptTemplateKey; config_json: string; updated_at: string }
    | undefined
  if (!row) throw new Error("Failed to save prompt template")
  return { name: row.name, template_text: String(row.config_json ?? ""), updated_at: row.updated_at }
}

export function resetPromptTemplateFile(nameRaw: string): PromptTemplateFileRow {
  const name = PromptTemplateKeySchema.parse(nameRaw)
  const nextText = getDefaultTemplateText(name)
  const database = getDb()
  database
    .prepare(
      `INSERT INTO prompt_configs (name, config_json, updated_at)
       VALUES (?, ?, ${nowSql()})
       ON CONFLICT(name) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
    )
    .run(name, nextText)

  cachedConfig = null
  cachedMaxUpdatedAt = ""

  const row = database.prepare("SELECT name, config_json, updated_at FROM prompt_configs WHERE name = ?").get(name) as
    | { name: PromptTemplateKey; config_json: string; updated_at: string }
    | undefined
  if (!row) throw new Error("Failed to reset prompt template")
  return { name: row.name, template_text: String(row.config_json ?? ""), updated_at: row.updated_at }
}

export function resetAllPromptTemplateFiles(): number {
  const database = getDb()
  const tx = database.transaction(() => {
    const disk: Record<PromptTemplateKey, string> = {} as Record<PromptTemplateKey, string>
    for (const name of PROMPT_TEMPLATE_KEYS) {
      disk[name] = getDefaultTemplateText(name)
    }

    mergePromptTemplateFiles(disk)

    const upsert = database.prepare(
      `INSERT INTO prompt_configs (name, config_json, updated_at)
       VALUES (?, ?, ${nowSql()})
       ON CONFLICT(name) DO UPDATE SET config_json = excluded.config_json, updated_at = excluded.updated_at`,
    )
    for (const name of PROMPT_TEMPLATE_KEYS) {
      upsert.run(name, disk[name])
    }
    return PROMPT_TEMPLATE_KEYS.length
  })

  const count = tx()
  cachedConfig = null
  cachedMaxUpdatedAt = ""
  return count
}
