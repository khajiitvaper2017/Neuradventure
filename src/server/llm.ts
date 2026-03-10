import OpenAI from "openai"
import { readFileSync, statSync } from "fs"
import { fileURLToPath } from "url"
import { dirname, join } from "path"
import { zodToJsonSchema } from "zod-to-json-schema"
import {
  TurnResponseSchema,
  GenerateCharacterResponseSchema,
  GenerateCharacterAppearanceResponseSchema,
  GenerateCharacterClothingResponseSchema,
  GenerateCharacterTraitsResponseSchema,
  GenerateStoryResponseSchema,
  type MainCharacterState,
  type NPCState,
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

// ─── Prompt config (hot-reloaded from shared/config.json) ────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url))
type PromptConfig = {
  systemPromptLines: string[]
  generateCharacterPrompt: string[]
  generateCharacterAppearancePrompt: string[]
  generateCharacterClothingPrompt: string[]
  generateCharacterTraitsPrompt: string[]
  generateStoryPrompt: string[]
}

const CONFIG_PATH = join(__dirname, "../../shared/config.json")
let cachedConfig: PromptConfig | null = null
let cachedConfigMtime = 0

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

function formatInventory(inventory: MainCharacterState["inventory"]): string {
  if (inventory.length === 0) return "nothing"
  return inventory.map((i) => `${i.name} (${i.description})`).join(", ")
}

function formatNPCs(npcs: NPCState[]): string {
  if (npcs.length === 0) return ""
  return npcs
    .map(
      (npc) =>
        `[${npc.name}]\n` +
        `  Race: ${npc.race}\n` +
        (npc.gender ? `  Gender: ${npc.gender}\n` : "") +
        `  Location: ${npc.last_known_location}\n` +
        `  Appearance: ${npc.appearance.physical_description}\n` +
        `  Wearing: ${npc.appearance.current_clothing}\n` +
        `  Relationship: ${npc.relationship_to_player}\n` +
        `  Personality: ${npc.personality_traits.join(", ")}\n` +
        `  Notes: ${npc.notes}`,
    )
    .join("\n\n")
}

function formatRecentHistory(turns: TurnRow[], maxTurns = 8): string {
  if (turns.length === 0) return "This is the beginning of the story."
  const recent = turns.slice(-maxTurns)
  return recent
    .map(
      (t) =>
        `> Player: ${t.player_input}\n  Story: ${t.narrative_text.slice(0, 400)}${t.narrative_text.length > 400 ? "..." : ""}`,
    )
    .join("\n\n")
}

export function buildTurnMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  playerInput: string,
  actionMode: string,
): OpenAI.ChatCompletionMessageParam[] {
  const npcSection = npcs.length > 0 ? `\n=== KNOWN NPCs ===\n${formatNPCs(npcs)}` : ""

  // Story mode: player injects narrative text directly; AI continues from it
  // Do/Say modes: player action that the AI responds to
  const actionSection =
    actionMode === "story"
      ? `=== STORY CONTINUATION (continue naturally from this) ===\n${playerInput}`
      : `=== PLAYER'S ACTION ===\n${actionMode === "say" ? `You say: ${playerInput}` : playerInput}`

  const contextBlock = `=== STORY CONTEXT ===
Scene: ${world.current_scene}
Time: ${world.time_of_day}
Recent events: ${world.recent_events_summary}

=== YOUR CHARACTER ===
Name: ${character.name} · ${character.race} · ${character.gender}
Appearance: ${character.appearance.physical_description}
Wearing: ${character.appearance.current_clothing}
Traits: ${[...character.personality_traits, ...character.custom_traits].join(", ")}
Inventory: ${formatInventory(character.inventory)}${npcSection}

=== STORY SO FAR ===
${formatRecentHistory(recentTurns)}

${actionSection}`

  return [
    { role: "system", content: getSystemPrompt() },
    { role: "user", content: contextBlock },
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

export async function callLLM(messages: OpenAI.ChatCompletionMessageParam[]): Promise<TurnResponse> {
  const schema = zodToJsonSchema(TurnResponseSchema, { name: "TurnResponse" })
  const result = await callLLMRaw<unknown>(messages, "TurnResponse", schema)
  return TurnResponseSchema.parse(result)
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
    response_format: {
      type: "json_schema",
      json_schema: { name: schemaName, schema },
    } as OpenAI.ResponseFormatJSONSchema,
  })
  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("LLM returned empty response")
  return JSON.parse(content) as T
}

export async function generateCharacter(description: string): Promise<GenerateCharacterResponse> {
  const schema = zodToJsonSchema(GenerateCharacterResponseSchema, { name: "GenerateCharacterResponse" })
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
      ? zodToJsonSchema(GenerateCharacterAppearanceResponseSchema, { name: "GenerateCharacterAppearanceResponse" })
      : part === "traits"
        ? zodToJsonSchema(GenerateCharacterTraitsResponseSchema, { name: "GenerateCharacterTraitsResponse" })
        : zodToJsonSchema(GenerateCharacterClothingResponseSchema, { name: "GenerateCharacterClothingResponse" })

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
  const schema = zodToJsonSchema(GenerateStoryResponseSchema, { name: "GenerateStoryResponse" })
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
