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
import type { TurnRow } from "./db.js"

const openai = new OpenAI({
  baseURL: "http://localhost:5001/v1",
  apiKey: "kobold",
})

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
      : `=== PLAYER'S ACTION ===\n${actionMode === "say" ? `You say: "${playerInput}"` : `You do: ${playerInput}`}`

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

export async function callLLM(messages: OpenAI.ChatCompletionMessageParam[]): Promise<TurnResponse> {
  const schema = zodToJsonSchema(TurnResponseSchema, { name: "TurnResponse" })
  const result = await callLLMRaw<unknown>(messages, "TurnResponse", schema, 1200)
  return TurnResponseSchema.parse(result)
}

async function callLLMRaw<T>(
  messages: OpenAI.ChatCompletionMessageParam[],
  schemaName: string,
  schema: object,
  maxTokens: number,
): Promise<T> {
  const res = await openai.chat.completions.create({
    model: "local",
    messages,
    max_tokens: maxTokens,
    temperature: 0.85,
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
    1000,
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
    500,
  )

  return part === "appearance"
    ? GenerateCharacterAppearanceResponseSchema.parse(result)
    : part === "traits"
      ? GenerateCharacterTraitsResponseSchema.parse(result)
      : GenerateCharacterClothingResponseSchema.parse(result)
}

export async function generateStory(
  description: string,
  characterName: string,
  characterTraits: string[],
): Promise<GenerateStoryResponse> {
  const schema = zodToJsonSchema(GenerateStoryResponseSchema, { name: "GenerateStoryResponse" })
  const traitsSuffix = characterTraits.length > 0 ? ` (${characterTraits.join(", ")})` : ""
  const result = await callLLMRaw<unknown>(
    [
      { role: "system", content: getConfig().generateStoryPrompt.join("\n") },
      {
        role: "user",
        content: `Character: ${characterName}${traitsSuffix}\n\nStory description: "${description}"`,
      },
    ],
    "GenerateStoryResponse",
    schema,
    300,
  )
  return GenerateStoryResponseSchema.parse(result)
}

export async function testConnection(): Promise<boolean> {
  try {
    await openai.models.list()
    return true
  } catch {
    return false
  }
}
