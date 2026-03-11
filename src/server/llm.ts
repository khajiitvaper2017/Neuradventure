import OpenAI from "openai"
import { readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { z } from "zod"
import { buildJsonSchemaResponseFormat, derefJsonSchema, zodSchemaToJsonSchema } from "./json-schema.js"
import {
  buildNPCStateUpdateSchema,
  buildNPCChangesSection,
  TurnResponseSchema,
  GenerateCharacterResponseSchema,
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateStoryResponseSchema,
  NPCCreationSchema,
  type MainCharacterState,
  type NPCState,
  type NPCCreation,
  type TurnResponse,
  type WorldState,
  type GenerateCharacterResponse,
  type GenerateCharacterAppearanceResponse,
  type GenerateCharacterClothingResponse,
  type GenerateCharacterTraitsResponse,
  type GenerateStoryResponse,
} from "./models.js"
import { type TurnRow, type GenerationParams, type LLMConnector, getSettings } from "./db.js"
import { desc } from "./schemas/field-descriptions.js"

// ─── OpenAI client (re-created when connector settings change) ───────────────

let cachedClient: OpenAI | null = null
let cachedClientKey = ""
let cachedCtxLimit = 0
let cachedCtxLimitAt = 0

function getClient(): OpenAI {
  const { connector } = getSettings()
  const key = `${connector.url}|${connector.api_key}`
  if (cachedClient && cachedClientKey === key) return cachedClient
  cachedClient = new OpenAI({ baseURL: connector.url, apiKey: connector.api_key })
  cachedClientKey = key
  return cachedClient
}

function getGenerationParams(): GenerationParams {
  return getSettings().generation
}

function getConnector(): LLMConnector {
  return getSettings().connector
}

function stripV1(url: string): string {
  return url.replace(/\/v1\/?$/, "")
}

function parseCtxLimit(payload: unknown): number | null {
  if (typeof payload === "number" && Number.isFinite(payload)) return payload
  if (typeof payload === "string") {
    const val = Number(payload.trim())
    return Number.isFinite(val) ? val : null
  }
  if (payload && typeof payload === "object") {
    const obj = payload as Record<string, unknown>
    const direct =
      obj.max_context_length ??
      obj.context_length ??
      obj.ctx_limit ??
      obj.n_ctx ??
      obj.value ??
      obj.max_ctx ??
      obj.max_length
    if (typeof direct === "number" && Number.isFinite(direct)) return direct
    if (Array.isArray(obj.data)) {
      for (const item of obj.data) {
        if (!item || typeof item !== "object") continue
        const dataObj = item as Record<string, unknown>
        const val =
          dataObj.max_context_length ??
          dataObj.context_length ??
          dataObj.ctx_limit ??
          dataObj.n_ctx ??
          dataObj.value ??
          dataObj.max_ctx ??
          dataObj.max_length
        if (typeof val === "number" && Number.isFinite(val)) return val
      }
    }
  }
  return null
}

async function fetchCtxLimitFromKobold(connector: LLMConnector): Promise<number | null> {
  const base = stripV1(connector.url)
  const candidates = [
    `${base}/api/extra/true_max_context_length`,
    `${base}/api/v1/config/max_context_length`,
    `${base}/api/v1/config/ctx_limit`,
    `${connector.url.replace(/\/?$/, "/")}models`,
  ]

  for (const url of candidates) {
    try {
      const res = await fetch(url)
      if (!res.ok) continue
      const text = await res.text()
      let payload: unknown = text
      try {
        payload = JSON.parse(text)
      } catch {
        // keep text
      }
      const val = parseCtxLimit(payload)
      if (val && val > 0) return val
    } catch {
      // ignore and try next
    }
  }
  return null
}

export async function getCtxLimit(): Promise<number> {
  const gen = getGenerationParams()
  if (gen.ctx_limit > 0) return gen.ctx_limit
  const now = Date.now()
  if (cachedCtxLimit > 0 && now - cachedCtxLimitAt < 5 * 60 * 1000) return cachedCtxLimit

  const fetched = await fetchCtxLimitFromKobold(getConnector())
  if (fetched && fetched > 0) {
    cachedCtxLimit = fetched
    cachedCtxLimitAt = now
    return fetched
  }
  return 0
}

export async function initCtxLimit(): Promise<void> {
  cachedCtxLimit = await getCtxLimit()
  cachedCtxLimitAt = Date.now()
}

export function getCtxLimitCached(): number {
  const gen = getGenerationParams()
  if (gen.ctx_limit > 0) return gen.ctx_limit
  return cachedCtxLimit
}

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

const CONFIG_PATH = join(__dirname, "../../shared/config.json")
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

function getConfig(): PromptConfig {
  const stat = statSync(CONFIG_PATH)
  if (!cachedConfig || stat.mtimeMs !== cachedConfigMtime) {
    cachedConfig = JSON.parse(readFileSync(CONFIG_PATH, "utf-8")) as PromptConfig
    cachedConfigMtime = stat.mtimeMs
  }
  return cachedConfig
}

const npcTraits: string[] = JSON.parse(readFileSync(join(__dirname, "../../shared/traits.json"), "utf-8"))

function getSystemPrompt(): string {
  return getConfig().systemPromptLines.join("\n").replace("{npcTraits}", npcTraits.join(", "))
}

function getNpcCreationPrompt(): string {
  const config = getConfig()
  const lines =
    config.npcCreationPrompt && config.npcCreationPrompt.length > 0
      ? config.npcCreationPrompt
      : config.systemPromptLines
  return lines.join("\n").replace("{npcTraits}", npcTraits.join(", "))
}

function getImpersonatePrompt(): string {
  const config = getConfig()
  const lines =
    config.impersonatePrompt && config.impersonatePrompt.length > 0
      ? config.impersonatePrompt
      : DEFAULT_IMPERSONATE_PROMPT
  return lines.join("\n")
}

function getSectionFormat(): SectionFormat {
  return getConfig().sectionFormat ?? "equals"
}

function toTitleCase(tag: string): string {
  return tag.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

function wrapSection(tag: string, content: string): string {
  switch (getSectionFormat()) {
    case "xml":
      return `<${tag}>\n${content}\n</${tag}>`
    case "markdown":
      return `## ${toTitleCase(tag)}\n${content}`
    case "equals":
    default:
      return `=== ${tag.toUpperCase().replace(/_/g, " ")} ===\n${content}`
  }
}

function formatInventory(inventory: MainCharacterState["inventory"]): string {
  if (inventory.length === 0) return "nothing"
  return inventory.map((i) => `${i.name} (${i.description})`).join(", ")
}

function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

function escapeForInlineJson(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')
}

function formatNPCBaselines(npcs: NPCState[]): string {
  if (npcs.length === 0) return ""
  return npcs
    .map(
      (npc) =>
        `[${npc.name}]\n` +
        `  Race: ${npc.race}\n` +
        (npc.gender ? `  Gender: ${npc.gender}\n` : "") +
        `  Baseline appearance: ${npc.appearance.baseline_appearance}\n` +
        `  Baseline description: ${npc.baseline_description}\n` +
        `  Personality traits: ${npc.personality_traits.join(", ")}\n` +
        `  Major flaws: ${npc.major_flaws.join(", ") || "none"}\n` +
        `  Quirks: ${npc.quirks.join(", ") || "none"}\n` +
        `  Perks: ${npc.perks.join(", ") || "none"}`,
    )
    .join("\n\n")
}

function formatNPCCurrentStates(npcs: NPCState[]): string {
  if (npcs.length === 0) return ""
  return npcs
    .map(
      (npc) =>
        `[${npc.name}]\n` +
        `  Current appearance: ${npc.appearance.current_appearance}\n` +
        `  Wearing: ${npc.appearance.current_clothing}\n` +
        `  Current activity: ${npc.current_activity}\n` +
        `  Location: ${npc.current_location}`,
    )
    .join("\n\n")
}

function formatLocations(locations: WorldState["locations"]): string {
  if (!locations || locations.length === 0) return ""
  return locations
    .map((location) => {
      const characters = location.characters.length > 0 ? location.characters.join(", ") : "none"
      const items =
        location.available_items.length > 0
          ? location.available_items.map((item) => `${item.name} (${item.description})`).join(", ")
          : "none"
      return (
        `[${location.name}]\n` +
        `  Description: ${location.description}\n` +
        `  Characters: ${characters}\n` +
        `  Items: ${items}`
      )
    })
    .join("\n\n")
}

function formatHistoryEntries(turns: TurnRow[]): string[] {
  if (turns.length === 0) return []
  return turns.map((t) => `> ${t.player_input}\n\n${t.narrative_text}`)
}

function injectAuthorNote(entries: string[], authorNote: { text: string; depth: number } | null | undefined): string[] {
  if (!authorNote || !authorNote.text.trim()) return entries
  const note = `[Author's Note: ${authorNote.text.trim()}]`
  const depth = Math.max(0, authorNote.depth)
  const insertIndex = Math.max(0, entries.length - depth)
  const result = [...entries]
  result.splice(insertIndex, 0, note)
  return result
}

function buildHistoryBlock(
  turns: TurnRow[],
  world: WorldState,
  ctxLimit: number,
  baseTokens: number,
  authorNote?: { text: string; depth: number } | null,
): { summary: string | null; history: string | null } {
  const rawEntries = formatHistoryEntries(turns)
  const entries = injectAuthorNote(rawEntries, authorNote)
  if (entries.length === 0) return { summary: null, history: null }

  let history = entries.join("\n\n")
  if (!ctxLimit || ctxLimit <= 0) return { summary: null, history }
  if (baseTokens + estimateTokens(history) <= ctxLimit) return { summary: null, history }

  const summaryContent = [
    "{",
    `  "current_scene": "${escapeForInlineJson(world.current_scene)}",`,
    `  "current_date": "${escapeForInlineJson(world.current_date)}",`,
    `  "time_of_day": "${escapeForInlineJson(world.time_of_day)}",`,
    `  "memory": "${escapeForInlineJson(world.memory)}"`,
    "}",
  ].join("\n")
  const summary = wrapSection("compressed_earlier_context", summaryContent)

  const targetRemove = Math.floor(ctxLimit * 0.6)
  let removedTokens = 0
  const remaining = [...entries]
  while (remaining.length > 0 && removedTokens < targetRemove) {
    const removed = remaining.shift()
    if (!removed) break
    removedTokens += estimateTokens(removed) + 1
  }

  let combinedHistory = remaining.join("\n\n")
  if (baseTokens + estimateTokens([summary, combinedHistory].join("\n\n")) <= ctxLimit) {
    return { summary, history: combinedHistory || null }
  }

  while (
    remaining.length > 0 &&
    baseTokens + estimateTokens([summary, remaining.join("\n\n")].join("\n\n")) > ctxLimit
  ) {
    remaining.shift()
  }

  combinedHistory = remaining.join("\n\n")
  if (baseTokens + estimateTokens([summary, combinedHistory].join("\n\n")) <= ctxLimit) {
    return { summary, history: combinedHistory || null }
  }
  return { summary, history: null }
}

// ─── Shared context block builder ─────────────────────────────────────────────

export interface ContextBlockOpts {
  character: MainCharacterState
  world: WorldState
  npcs: NPCState[]
  recentTurns: TurnRow[]
  ctxLimit: number
  initialCharacter?: MainCharacterState
  actionBlock?: string | null
  memory?: string | null
  authorNote?: { text: string; depth: number } | null
}

function buildContextBlock(opts: ContextBlockOpts): string {
  const { character, world, npcs, recentTurns, ctxLimit, initialCharacter, actionBlock, authorNote } = opts
  const initial = initialCharacter ?? character

  // ── STABLE (cached across turns) ──
  const initialSection = wrapSection(
    "initial_character",
    `Baseline appearance: ${initial.appearance.baseline_appearance}\n` +
      `Current appearance: ${initial.appearance.current_appearance}\n` +
      `Wearing: ${initial.appearance.current_clothing}`,
  )

  const baseSection = wrapSection(
    "player_character_base",
    `Name: ${character.name} · ${character.race} · ${character.gender}\n` +
      `Baseline description: ${character.baseline_description}\n` +
      `Personality traits: ${character.personality_traits.join(", ") || "none"}\n` +
      `Major flaws: ${character.major_flaws.join(", ") || "none"}\n` +
      `Quirks: ${character.quirks.join(", ") || "none"}\n` +
      `Perks: ${character.perks.join(", ") || "none"}`,
  )

  const npcBaselineSection = npcs.length > 0 ? wrapSection("npc_baselines", formatNPCBaselines(npcs)) : null

  const locationSection =
    world.locations && world.locations.length > 0 ? wrapSection("locations", formatLocations(world.locations)) : null

  // ── SEMI-STABLE ──
  const memorySection = world.memory ? wrapSection("memory", world.memory) : null

  const authorNoteSection =
    authorNote && authorNote.text.trim() ? wrapSection("author_note", authorNote.text.trim()) : null

  // ── VOLATILE ──
  const currentSection = wrapSection(
    "player_character_state",
    `Current appearance: ${character.appearance.current_appearance}\n` +
      `Wearing: ${character.appearance.current_clothing}\n` +
      `Current activity: ${character.current_activity}\n` +
      `Location: ${character.current_location}\n` +
      `Inventory: ${formatInventory(character.inventory)}`,
  )

  const npcCurrentSection = npcs.length > 0 ? wrapSection("npc_current_states", formatNPCCurrentStates(npcs)) : null

  const storyContextSection = wrapSection(
    "story_context",
    `Scene: ${world.current_scene}\n` + `Date: ${world.current_date}\n` + `Time: ${world.time_of_day}`,
  )

  const joinSections = (sections: Array<string | null | undefined>): string => sections.filter(Boolean).join("\n\n")

  const storyHeader = wrapSection("story_so_far", "").replace(/\n$/, "")
  const afterHistory = joinSections([currentSection, npcCurrentSection, storyContextSection, actionBlock])

  const stableBlock = joinSections([
    initialSection,
    baseSection,
    npcBaselineSection,
    locationSection,
    memorySection,
    authorNoteSection,
  ])

  const baseTokens = estimateTokens(joinSections([stableBlock, storyHeader, afterHistory]))
  const { summary, history } = buildHistoryBlock(recentTurns, world, ctxLimit, baseTokens, authorNote)

  const storySoFarHeader = history ? storyHeader : null
  return joinSections([stableBlock, summary || null, storySoFarHeader, history || null, afterHistory || null])
}

// ─── Message builders (thin wrappers over buildContextBlock) ──────────────────

export function buildTurnMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  playerInput: string,
  actionMode: string,
  initialCharacter?: MainCharacterState,
  ctxLimitOverride?: number,
  authorNote?: { text: string; depth: number } | null,
): OpenAI.ChatCompletionMessageParam[] {
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit
  const hasPlayerInput = playerInput.trim().length > 0
  const actionSection =
    actionMode === "story"
      ? hasPlayerInput
        ? wrapSection("story_continuation", playerInput)
        : wrapSection("story_continuation", "")
      : hasPlayerInput
        ? wrapSection("players_action", actionMode === "say" ? `You say: ${playerInput}` : playerInput)
        : null

  const contextBlock = buildContextBlock({
    character,
    world,
    npcs,
    recentTurns,
    ctxLimit,
    initialCharacter,
    actionBlock: actionSection,
    authorNote,
  })

  return [
    { role: "system", content: getSystemPrompt() },
    { role: "user", content: contextBlock },
  ]
}

export function buildNpcCreationMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  npcName: string,
  ctxLimitOverride?: number,
  authorNote?: { text: string; depth: number } | null,
): OpenAI.ChatCompletionMessageParam[] {
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit
  const actionBlock =
    npcName.trim().length > 0 ? wrapSection("introduce_new_npc", npcName) : wrapSection("introduce_new_npc", "")

  const contextBlock = buildContextBlock({
    character,
    world,
    npcs,
    recentTurns,
    ctxLimit,
    actionBlock,
    authorNote,
  })

  return [
    { role: "system", content: getNpcCreationPrompt() },
    { role: "user", content: contextBlock },
  ]
}

export function buildImpersonateMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  actionMode: string,
  initialCharacter?: MainCharacterState,
  ctxLimitOverride?: number,
  authorNote?: { text: string; depth: number } | null,
): OpenAI.ChatCompletionMessageParam[] {
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit
  const actionModeHint =
    actionMode === "say"
      ? "Say only the exact words spoken. No quotes or 'You say'."
      : actionMode === "story"
        ? "Continue the story in 1-2 short sentences, second-person present tense."
        : "Describe the action the player takes in a short, concrete clause."
  const actionModeSection = wrapSection("action_mode", `${actionMode}\n${actionModeHint}`)

  const contextBlock = buildContextBlock({
    character,
    world,
    npcs,
    recentTurns,
    ctxLimit,
    initialCharacter,
    actionBlock: actionModeSection,
    authorNote,
  })
  const prompt = `${contextBlock}\n\n${wrapSection("players_action", "")}`

  return [
    { role: "system", content: getImpersonatePrompt() },
    { role: "user", content: prompt },
  ]
}

// ─── LLM calls ───────────────────────────────────────────────────────────────

function buildSamplingParams(
  gen: GenerationParams,
  maxTokensOverride?: number,
  options: { disableRepetition?: boolean } = {},
): Record<string, unknown> {
  const params: Record<string, unknown> = {
    max_tokens: maxTokensOverride ?? gen.max_tokens,
    temperature: gen.temperature,
  }

  const repeatPenalty = options.disableRepetition ? 1.0 : gen.repeat_penalty
  const repeatLastN = options.disableRepetition ? 0 : gen.repeat_last_n
  const dryMultiplier = options.disableRepetition ? 0.0 : gen.dry_multiplier

  // Only include non-default params to keep the request clean
  if (gen.top_k !== 40) params.top_k = gen.top_k
  if (gen.top_p !== 0.95) params.top_p = gen.top_p
  if (gen.min_p !== 0.05) params.min_p = gen.min_p
  if (gen.typical_p !== 1.0) params.typical_p = gen.typical_p
  if (gen.top_n_sigma !== -1.0) params.top_n_sigma = gen.top_n_sigma
  if (repeatPenalty !== 1.0) params.repeat_penalty = repeatPenalty
  if (repeatLastN !== 64) params.repeat_last_n = repeatLastN
  if (gen.presence_penalty !== 0.0) params.presence_penalty = gen.presence_penalty
  if (gen.frequency_penalty !== 0.0) params.frequency_penalty = gen.frequency_penalty
  if (gen.mirostat !== 0) {
    params.mirostat = gen.mirostat
    params.mirostat_tau = gen.mirostat_tau
    params.mirostat_eta = gen.mirostat_eta
  }
  if (gen.dynatemp_range !== 0.0) {
    params.dynatemp_range = gen.dynatemp_range
    params.dynatemp_exponent = gen.dynatemp_exponent
  }
  if (dryMultiplier !== 0.0) {
    params.dry_multiplier = dryMultiplier
    params.dry_base = gen.dry_base
    params.dry_allowed_length = gen.dry_allowed_length
    params.dry_penalty_last_n = gen.dry_penalty_last_n
  }
  if (gen.xtc_probability !== 0.0) {
    params.xtc_probability = gen.xtc_probability
    params.xtc_threshold = gen.xtc_threshold
  }
  if (gen.seed !== -1) params.seed = gen.seed

  return params
}

function buildTurnResponseSchema(knownNpcs: NPCState[]): z.ZodType<TurnResponse, z.ZodTypeDef, unknown> {
  const uniqueNames = Array.from(new Set(knownNpcs.map((npc) => npc.name.trim()).filter((name) => name.length > 0)))

  if (uniqueNames.length === 0) {
    const emptyUpdates = buildNPCStateUpdateSchema(z.string().min(1).describe(desc("llm.npc_update.name")))
    return TurnResponseSchema.extend({
      npc_changes: z.array(emptyUpdates).max(0).optional(),
    })
  }

  const enumValues = uniqueNames as [string, ...string[]]
  const npcChangesSchema = buildNPCChangesSection(z.enum(enumValues).describe(desc("llm.npc_update.name")))

  return TurnResponseSchema.extend({
    npc_changes: npcChangesSchema.optional(),
  })
}

export async function callLLM(
  messages: OpenAI.ChatCompletionMessageParam[],
  knownNpcs: NPCState[] = [],
): Promise<TurnResponse> {
  const turnSchema = buildTurnResponseSchema(knownNpcs)
  const schema = zodSchemaToJsonSchema(turnSchema, "TurnResponse")
  const result = await callLLMRaw<unknown>(messages, "TurnResponse", schema)
  return turnSchema.parse(result)
}

export async function generateNpcCreation(
  messages: OpenAI.ChatCompletionMessageParam[],
  forcedName?: string,
): Promise<NPCCreation> {
  const creationSchema = NPCCreationSchema
  const schema = zodSchemaToJsonSchema(creationSchema, "NPCCreation")
  const result = await callLLMRaw<unknown>(messages, "NPCCreation", schema)
  const parsed = creationSchema.parse(result)
  return forcedName ? { ...parsed, name: forcedName } : parsed
}

async function callLLMRaw<T>(
  messages: OpenAI.ChatCompletionMessageParam[],
  schemaName: string,
  schema: object,
  maxTokensOverride?: number,
  options: { disableRepetition?: boolean } = {},
): Promise<T> {
  const gen = getGenerationParams()
  const sampling = buildSamplingParams(gen, maxTokensOverride, options)
  const jsonSchema = derefJsonSchema(schema)

  const res = await getClient().chat.completions.create({
    model: "local",
    messages,
    ...sampling,
    stream: false,
    response_format: buildJsonSchemaResponseFormat(schemaName, jsonSchema) as OpenAI.ResponseFormatJSONSchema,
    // Ensure KoboldCpp applies schema-derived grammar even if response_format is ignored.
    json_schema: jsonSchema,
    grammar_lazy: false,
    grammar_triggers: [],
  } as OpenAI.ChatCompletionCreateParams & { json_schema: object; grammar_lazy: boolean; grammar_triggers: unknown[] })
  if (!("choices" in res)) {
    throw new Error("LLM returned a streamed response unexpectedly")
  }
  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("LLM returned empty response")
  return parseJsonFromContent(content, schemaName) as T
}

function parseJsonFromContent(content: string, schemaName: string): unknown {
  const direct = tryParseJson(content)
  if (direct.ok) return direct.value

  const fenced = extractFencedJson(content)
  if (fenced) {
    const fencedParsed = tryParseJson(fenced)
    if (fencedParsed.ok) return fencedParsed.value
  }

  const extracted = extractFirstJsonValue(content)
  if (extracted) {
    const extractedParsed = tryParseJson(extracted)
    if (extractedParsed.ok) return extractedParsed.value
  }

  const preview = content.length > 280 ? `${content.slice(0, 280)}...` : content
  const base = direct.error ? ` (${direct.error.message})` : ""
  throw new Error(`LLM returned invalid JSON for ${schemaName}${base}. Preview: ${preview}`)
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

function extractFencedJson(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return match ? match[1] : null
}

function extractFirstJsonValue(text: string): string | null {
  let start = -1
  let depth = 0
  let inString = false
  let escape = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (start === -1) {
      if (char === "{" || char === "[") {
        start = i
        depth = 1
        inString = false
        escape = false
      }
      continue
    }

    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (char === "\\") {
        escape = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{" || char === "[") {
      depth += 1
      continue
    }
    if (char === "}" || char === "]") {
      depth -= 1
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}

async function callLLMText(
  messages: OpenAI.ChatCompletionMessageParam[],
  maxTokensOverride?: number,
  options: { disableRepetition?: boolean; stop?: string[] } = {},
): Promise<string> {
  const gen = getGenerationParams()
  const sampling = buildSamplingParams(gen, maxTokensOverride, options)
  const stop = options.stop && options.stop.length > 0 ? options.stop : ["\n\n===", "\n==="]

  const res = await getClient().chat.completions.create({
    model: "local",
    messages,
    ...sampling,
    stop,
  })
  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("LLM returned empty response")
  return content
}

function sanitizePlayerAction(text: string): string {
  let value = text.trim()
  value = value.replace(/^===\s*PLAYER'S ACTION\s*===\s*/i, "")
  value = value.replace(/^Player action:\s*/i, "")
  const markerIndex = value.search(/\n\s*===\s+/)
  if (markerIndex >= 0) value = value.slice(0, markerIndex)
  return value.trim()
}

export async function generatePlayerAction(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  actionMode: string,
  initialCharacter?: MainCharacterState,
  ctxLimitOverride?: number,
  authorNote?: { text: string; depth: number } | null,
): Promise<string> {
  const messages = buildImpersonateMessages(
    character,
    world,
    npcs,
    recentTurns,
    actionMode,
    initialCharacter,
    ctxLimitOverride,
    authorNote,
  )
  const maxTokens = Math.min(getGenerationParams().max_tokens, 160)
  const raw = await callLLMText(messages, maxTokens, { disableRepetition: true, stop: ["\n"] })
  return sanitizePlayerAction(raw)
}

export async function generateCharacter(description: string): Promise<GenerateCharacterResponse> {
  const schema = zodSchemaToJsonSchema(GenerateCharacterResponseSchema, "GenerateCharacterResponse")
  const result = await callLLMRaw<unknown>(
    [
      {
        role: "system",
        content:
          getConfig().generateCharacterPrompt.join("\n") + `\n\nAvailable personality traits: ${npcTraits.join(", ")}`,
      },
      { role: "user", content: `Create a character based on this description: "${description}"` },
    ],
    "GenerateCharacterResponse",
    schema,
    undefined,
    { disableRepetition: true },
  )
  return GenerateCharacterResponseSchema.parse(result)
}

type CharacterGenerationContext = {
  name: string
  race: string
  gender: string
  appearance: {
    baseline_appearance: string
    current_appearance: string
    current_clothing: string
  }
  baseline_description: string
  current_activity: string
  personality_traits: string[]
  major_flaws: string[]
  quirks: string[]
  perks: string[]
}

function formatCharacterContext(
  context: CharacterGenerationContext,
  part: "appearance" | "traits" | "clothing",
): string {
  const lines = [
    `Name: ${context.name || "Unknown"}`,
    `Race: ${context.race || "Unknown"}`,
    `Gender: ${context.gender || "Unknown"}`,
  ]

  if (part === "traits") {
    const appearance = [
      context.appearance.baseline_appearance,
      context.appearance.current_appearance,
      context.appearance.current_clothing,
    ]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(" | ")
    lines.push(`Appearance: ${appearance || "Unknown"}`)
    lines.push(`Baseline description: ${context.baseline_description || "Unknown"}`)
  } else if (part === "appearance") {
    lines.push(`Baseline description: ${context.baseline_description || "Unknown"}`)
    lines.push(`Personality traits: ${context.personality_traits.join(", ") || "Unknown"}`)
    lines.push(`Major flaws: ${context.major_flaws.join(", ") || "None"}`)
    lines.push(`Quirks: ${context.quirks.join(", ") || "None"}`)
    lines.push(`Perks: ${context.perks.join(", ") || "None"}`)
  } else {
    lines.push(`Baseline appearance: ${context.appearance.baseline_appearance.trim() || "Unknown"}`)
    lines.push(`Current appearance: ${context.appearance.current_appearance.trim() || "Unknown"}`)
    lines.push(`Baseline description: ${context.baseline_description || "Unknown"}`)
    lines.push(`Personality traits: ${context.personality_traits.join(", ") || "Unknown"}`)
    lines.push(`Major flaws: ${context.major_flaws.join(", ") || "None"}`)
    lines.push(`Quirks: ${context.quirks.join(", ") || "None"}`)
    lines.push(`Perks: ${context.perks.join(", ") || "None"}`)
  }

  return lines.join("\n")
}

export async function generateCharacterPart(
  part: "appearance" | "traits" | "clothing",
  context: CharacterGenerationContext,
): Promise<GenerateCharacterAppearanceResponse | GenerateCharacterTraitsResponse | GenerateCharacterClothingResponse> {
  const schema =
    part === "appearance"
      ? zodSchemaToJsonSchema(GenerateCharacterAppearanceResponseSchema, "GenerateCharacterAppearanceResponse")
      : part === "traits"
        ? zodSchemaToJsonSchema(GenerateCharacterTraitsResponseSchema, "GenerateCharacterTraitsResponse")
        : zodSchemaToJsonSchema(GenerateCharacterClothingResponseSchema, "GenerateCharacterClothingResponse")

  const config = getConfig()
  const partPrompt =
    part === "appearance"
      ? config.generateCharacterAppearancePrompt
      : part === "traits"
        ? config.generateCharacterTraitsPrompt
        : config.generateCharacterClothingPrompt
  const prompt = [partPrompt.join("\n"), `Available personality traits: ${npcTraits.join(", ")}`]
    .filter(Boolean)
    .join("\n\n")
  const userContent = [
    `Regenerate: ${part}`,
    "Character context:",
    formatCharacterContext(context, part),
    "Instruction: Use the context above to regenerate ONLY the requested section.",
    part === "appearance"
      ? "Do not reuse or paraphrase the current appearance. Keep it consistent with the identity and traits."
      : part === "traits"
        ? "Do not reuse the current personality traits, major flaws, quirks, or perks. Keep them consistent with the identity and appearance."
        : "Do not reuse or paraphrase the current clothing. Keep it consistent with the identity, appearance, and traits.",
  ].join("\n")

  const result = await callLLMRaw<unknown>(
    [
      { role: "system", content: prompt },
      { role: "user", content: userContent },
    ],
    part === "appearance"
      ? "GenerateCharacterAppearanceResponse"
      : part === "traits"
        ? "GenerateCharacterTraitsResponse"
        : "GenerateCharacterClothingResponse",
    schema,
    undefined,
    { disableRepetition: true },
  )

  return part === "appearance"
    ? GenerateCharacterAppearanceResponseSchema.parse(result)
    : part === "traits"
      ? GenerateCharacterTraitsResponseSchema.parse(result)
      : GenerateCharacterClothingResponseSchema.parse(result)
}

export async function generateStory(
  description: string,
  character: {
    name: string
    race: string
    gender: string
    current_location?: string
    appearance: { baseline_appearance: string; current_appearance: string; current_clothing: string }
    baseline_description: string
    current_activity: string
    personality_traits: string[]
    major_flaws: string[]
    quirks: string[]
    perks: string[]
  },
): Promise<GenerateStoryResponse> {
  const schema = zodSchemaToJsonSchema(GenerateStoryResponseSchema, "GenerateStoryResponse")
  const traits = [...character.personality_traits, ...character.quirks, ...character.perks]
    .map((t) => t.trim())
    .filter(Boolean)
  const baselineAppearance = character.appearance.baseline_appearance || "Unknown"
  const currentAppearance = character.appearance.current_appearance || baselineAppearance
  const baselineDescription = character.baseline_description || "Unknown"
  const currentActivity = character.current_activity || "Unknown"
  const majorFlaws = character.major_flaws?.map((t) => t.trim()).filter(Boolean) ?? []
  const result = await callLLMRaw<unknown>(
    [
      { role: "system", content: getConfig().generateStoryPrompt.join("\n") },
      {
        role: "user",
        content: [
          "Character:",
          `Name: ${character.name}`,
          `Race: ${character.race || "Unknown"}`,
          `Gender: ${character.gender || "Unknown"}`,
          `Baseline appearance: ${baselineAppearance}`,
          `Current appearance: ${currentAppearance}`,
          `Clothing: ${character.appearance.current_clothing || "Unknown"}`,
          `Baseline description: ${baselineDescription}`,
          `Current activity: ${currentActivity}`,
          `Major flaws: ${majorFlaws.length > 0 ? majorFlaws.join(", ") : "None"}`,
          `Traits: ${traits.length > 0 ? traits.join(", ") : "Unknown"}`,
          `Story description: "${description}"`,
        ].join("\n"),
      },
    ],
    "GenerateStoryResponse",
    schema,
    undefined,
    { disableRepetition: true },
  )
  return GenerateStoryResponseSchema.parse(result)
}

export async function testConnection(): Promise<boolean> {
  try {
    const client = new OpenAI({ baseURL: getConnector().url, apiKey: getConnector().api_key })
    await client.models.list()
    return true
  } catch {
    return false
  }
}
