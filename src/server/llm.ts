import OpenAI from "openai"
import { readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { z } from "zod"
import { buildJsonSchemaResponseFormat, zodSchemaToJsonSchema } from "./json-schema.js"
import {
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
  return cachedCtxLimit
}

// ─── Prompt config (hot-reloaded from shared/config.json) ────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
type PromptConfig = {
  systemPromptLines: string[]
  generateCharacterPrompt: string[]
  generateCharacterAppearancePrompt: string[]
  generateCharacterClothingPrompt: string[]
  generateCharacterTraitsPrompt: string[]
  generateStoryPrompt: string[]
  npcCreationPrompt?: string[]
  impersonatePrompt?: string[]
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
  const lines = config.npcCreationPrompt && config.npcCreationPrompt.length > 0 ? config.npcCreationPrompt : config.systemPromptLines
  return lines.join("\n").replace("{npcTraits}", npcTraits.join(", "))
}

function getImpersonatePrompt(): string {
  const config = getConfig()
  const lines = config.impersonatePrompt && config.impersonatePrompt.length > 0 ? config.impersonatePrompt : DEFAULT_IMPERSONATE_PROMPT
  return lines.join("\n")
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

function formatNPCs(npcs: NPCState[]): string {
  if (npcs.length === 0) return ""
  return npcs
    .map(
      (npc) =>
        `[${npc.name}]\n` +
        `  Race: ${npc.race}\n` +
        (npc.gender ? `  Gender: ${npc.gender}\n` : "") +
        `  Personality: ${npc.personality_traits.join(", ")}\n` +
        `  Relationship: ${npc.relationship_to_player}\n` +
        `  Appearance: ${npc.appearance.physical_description}\n` +
        `  Wearing: ${npc.appearance.current_clothing}\n` +
        `  Location: ${npc.last_known_location}\n` +
        `  Notes: ${npc.notes}`,
    )
    .join("\n\n")
}

function formatHistoryEntries(turns: TurnRow[]): string[] {
  if (turns.length === 0) return []
  return turns.map((t) => `> ${t.player_input}\n\n${t.narrative_text}`)
}

function buildHistoryBlock(
  turns: TurnRow[],
  world: WorldState,
  ctxLimit: number,
  baseTokens: number,
): string {
  const entries = formatHistoryEntries(turns)
  if (entries.length === 0) return ""

  let history = entries.join("\n\n")
  if (!ctxLimit || ctxLimit <= 0) return history
  if (baseTokens + estimateTokens(history) <= ctxLimit) return history

  const summary = [
    "=== COMPRESSED EARLIER CONTEXT ===",
    "{",
    `  "current_scene": "${escapeForInlineJson(world.current_scene)}",`,
    `  "day_of_week": "${escapeForInlineJson(world.day_of_week)}",`,
    `  "time_of_day": "${escapeForInlineJson(world.time_of_day)}",`,
    `  "recent_events_summary": "${escapeForInlineJson(world.recent_events_summary)}"`,
    "}",
  ].join("\n")

  const targetRemove = Math.floor(ctxLimit * 0.6)
  let removedTokens = 0
  const remaining = [...entries]
  while (remaining.length > 0 && removedTokens < targetRemove) {
    const removed = remaining.shift()
    if (!removed) break
    removedTokens += estimateTokens(removed) + 1
  }

  let combined = [summary, ...remaining].join("\n\n")
  if (baseTokens + estimateTokens(combined) <= ctxLimit) return combined

  while (remaining.length > 0 && baseTokens + estimateTokens([summary, ...remaining].join("\n\n")) > ctxLimit) {
    remaining.shift()
  }

  combined = [summary, ...remaining].join("\n\n")
  if (baseTokens + estimateTokens(combined) <= ctxLimit) return combined
  return summary
}

export function buildTurnMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  playerInput: string,
  actionMode: string,
  initialCharacter?: MainCharacterState,
  ctxLimitOverride?: number,
): OpenAI.ChatCompletionMessageParam[] {
  const npcSection = npcs.length > 0 ? `=== KNOWN NPCs ===\n${formatNPCs(npcs)}` : ""
  const initial = initialCharacter ?? character
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit

  // Story mode: player injects narrative text directly; AI continues from it
  // Do/Say modes: player action that the AI responds to
  const hasPlayerInput = playerInput.trim().length > 0
  const actionSection =
    actionMode === "story"
      ? hasPlayerInput
        ? `=== STORY CONTINUATION (continue naturally from this) ===\n${playerInput}`
        : "=== STORY CONTINUATION (continue naturally from this) ===\n"
      : hasPlayerInput
        ? `=== PLAYER'S ACTION ===\n${actionMode === "say" ? `You say: ${playerInput}` : playerInput}`
        : ""
  const actionBlock = actionSection || null

  const storyContext =
    `=== STORY CONTEXT ===\n` +
    `Scene: ${world.current_scene}\n` +
    `Day: ${world.day_of_week}\n` +
    `Time: ${world.time_of_day}\n` +
    `Recent events: ${world.recent_events_summary}`

  const initialSection =
    `=== INITIAL CHARACTER (STORY START) ===\n` +
    `Appearance: ${initial.appearance.physical_description}\n` +
    `Wearing: ${initial.appearance.current_clothing}`
  const baseSection =
    `=== PLAYER CHARACTER (BASE) ===\n` +
    `Name: ${character.name} · ${character.race} · ${character.gender}\n` +
    `Traits: ${[...character.personality_traits, ...character.custom_traits].join(", ")}`
  const currentSection =
    `=== PLAYER CHARACTER STATE ===\n` +
    `Appearance: ${character.appearance.physical_description}\n` +
    `Wearing: ${character.appearance.current_clothing}\n` +
    `Inventory: ${formatInventory(character.inventory)}`

  const joinSections = (sections: Array<string | null | undefined>): string => sections.filter(Boolean).join("\n\n")

  const prefix = joinSections([initialSection, "=== STORY SO FAR ==="]) + "\n"
  const afterHistory = joinSections([baseSection, currentSection, npcSection || null, storyContext, actionBlock])
  const baseTokens = estimateTokens(`${prefix}${afterHistory ? `\n\n${afterHistory}` : ""}`)
  const history = buildHistoryBlock(recentTurns, world, ctxLimit, baseTokens)

  const contextBlock = `${prefix}${history}${afterHistory ? `\n\n${afterHistory}` : ""}`

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
): OpenAI.ChatCompletionMessageParam[] {
  const npcSection = npcs.length > 0 ? `=== KNOWN NPCs ===\n${formatNPCs(npcs)}` : ""
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit
  const actionBlock = npcName.trim().length > 0 ? `===INTRODUCE NEW NPC===\n${npcName}` : "===INTRODUCE NEW NPC==="

  const storyContext =
    `=== STORY CONTEXT ===\n` +
    `Scene: ${world.current_scene}\n` +
    `Day: ${world.day_of_week}\n` +
    `Time: ${world.time_of_day}\n` +
    `Recent events: ${world.recent_events_summary}`

  const baseSection =
    `=== PLAYER CHARACTER (BASE) ===\n` +
    `Name: ${character.name} · ${character.race} · ${character.gender}\n` +
    `Traits: ${[...character.personality_traits, ...character.custom_traits].join(", ")}`
  const currentSection =
    `=== PLAYER CHARACTER STATE ===\n` +
    `Appearance: ${character.appearance.physical_description}\n` +
    `Wearing: ${character.appearance.current_clothing}\n` +
    `Inventory: ${formatInventory(character.inventory)}`

  const joinSections = (sections: Array<string | null | undefined>): string => sections.filter(Boolean).join("\n\n")

  const prefix = "=== STORY SO FAR ===\n"
  const afterHistory = joinSections([baseSection, currentSection, npcSection || null, storyContext, actionBlock])
  const baseTokens = estimateTokens(`${prefix}${afterHistory ? `\n\n${afterHistory}` : ""}`)
  const history = buildHistoryBlock(recentTurns, world, ctxLimit, baseTokens)

  const contextBlock = `${prefix}${history}${afterHistory ? `\n\n${afterHistory}` : ""}`

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
): OpenAI.ChatCompletionMessageParam[] {
  const npcSection = npcs.length > 0 ? `=== KNOWN NPCs ===\n${formatNPCs(npcs)}` : ""
  const initial = initialCharacter ?? character
  const ctxLimit = ctxLimitOverride ?? getGenerationParams().ctx_limit
  const actionModeHint =
    actionMode === "say"
      ? "Say only the exact words spoken. No quotes or 'You say'."
      : actionMode === "story"
        ? "Continue the story in 1-2 short sentences, second-person present tense."
        : "Describe the action the player takes in a short, concrete clause."
  const actionModeSection = `=== ACTION MODE ===\n${actionMode}\n${actionModeHint}`

  const storyContext =
    `=== STORY CONTEXT ===\n` +
    `Scene: ${world.current_scene}\n` +
    `Day: ${world.day_of_week}\n` +
    `Time: ${world.time_of_day}\n` +
    `Recent events: ${world.recent_events_summary}`

  const initialSection =
    `=== INITIAL CHARACTER (STORY START) ===\n` +
    `Appearance: ${initial.appearance.physical_description}\n` +
    `Wearing: ${initial.appearance.current_clothing}`
  const baseSection =
    `=== PLAYER CHARACTER (BASE) ===\n` +
    `Name: ${character.name} · ${character.race} · ${character.gender}\n` +
    `Traits: ${[...character.personality_traits, ...character.custom_traits].join(", ")}`
  const currentSection =
    `=== PLAYER CHARACTER STATE ===\n` +
    `Appearance: ${character.appearance.physical_description}\n` +
    `Wearing: ${character.appearance.current_clothing}\n` +
    `Inventory: ${formatInventory(character.inventory)}`

  const joinSections = (sections: Array<string | null | undefined>): string => sections.filter(Boolean).join("\n\n")

  const prefix = joinSections([initialSection, "=== STORY SO FAR ==="]) + "\n"
  const afterHistory = joinSections([baseSection, currentSection, npcSection || null, storyContext, actionModeSection])
  const baseTokens = estimateTokens(`${prefix}${afterHistory ? `\n\n${afterHistory}` : ""}`)
  const history = buildHistoryBlock(recentTurns, world, ctxLimit, baseTokens)

  const contextBlock = `${prefix}${history}${afterHistory ? `\n\n${afterHistory}` : ""}`
  const prompt = `${contextBlock}\n\n=== PLAYER'S ACTION ===\n`

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

function buildTurnResponseSchema(knownNpcNames: string[]): z.ZodType<TurnResponse> {
  const uniqueNames = Array.from(new Set(knownNpcNames.map((name) => name.trim()).filter((name) => name.length > 0)))

  if (uniqueNames.length === 0) {
    return TurnResponseSchema.extend({
      npc_changes: z.object({ has_updates: z.literal(false) }).strict(),
    })
  }

  const enumValues = uniqueNames as [string, ...string[]]
  return TurnResponseSchema.extend({
    npc_changes: buildNPCChangesSection(z.enum(enumValues)),
  })
}

export async function callLLM(
  messages: OpenAI.ChatCompletionMessageParam[],
  knownNpcNames: string[] = [],
): Promise<TurnResponse> {
  const turnSchema = buildTurnResponseSchema(knownNpcNames)
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

  const res = await getClient().chat.completions.create({
    model: "local",
    messages,
    ...sampling,
    response_format: buildJsonSchemaResponseFormat(schemaName, schema) as OpenAI.ResponseFormatJSONSchema,
  })
  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("LLM returned empty response")
  return JSON.parse(content) as T
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
): Promise<string> {
  const messages = buildImpersonateMessages(
    character,
    world,
    npcs,
    recentTurns,
    actionMode,
    initialCharacter,
    ctxLimitOverride,
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
    physical_description: string
    current_clothing: string
  }
  personality_traits: string[]
  custom_traits: string[]
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
    const appearance = [context.appearance.physical_description, context.appearance.current_clothing]
      .map((v) => v.trim())
      .filter(Boolean)
      .join(" | ")
    lines.push(`Appearance: ${appearance || "Unknown"}`)
  } else if (part === "appearance") {
    lines.push(`Personality traits: ${context.personality_traits.join(", ") || "Unknown"}`)
    lines.push(`Custom traits: ${context.custom_traits.join(", ") || "None"}`)
  } else {
    lines.push(`Physical description: ${context.appearance.physical_description.trim() || "Unknown"}`)
    lines.push(`Personality traits: ${context.personality_traits.join(", ") || "Unknown"}`)
    lines.push(`Custom traits: ${context.custom_traits.join(", ") || "None"}`)
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
    "",
    "Character context:",
    formatCharacterContext(context, part),
    "",
    "Instruction: Use the context above to regenerate ONLY the requested section.",
    part === "appearance"
      ? "Do not reuse or paraphrase the current physical description. Keep it consistent with the identity and traits."
      : part === "traits"
        ? "Do not reuse the current personality traits or custom traits. Keep them consistent with the identity and appearance."
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
    appearance: { physical_description: string; current_clothing: string }
    personality_traits: string[]
    custom_traits: string[]
  },
): Promise<GenerateStoryResponse> {
  const schema = zodSchemaToJsonSchema(GenerateStoryResponseSchema, "GenerateStoryResponse")
  const traits = [...character.personality_traits, ...character.custom_traits].map((t) => t.trim()).filter(Boolean)
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
          `Appearance: ${character.appearance.physical_description || "Unknown"}`,
          `Clothing: ${character.appearance.current_clothing || "Unknown"}`,
          `Traits: ${traits.length > 0 ? traits.join(", ") : "Unknown"}`,
          "",
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
