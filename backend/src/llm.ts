import OpenAI from "openai"
import { zodToJsonSchema } from "zod-to-json-schema"
import { TurnResponseSchema, type MainCharacterState, type NPCState, type TurnResponse, type WorldState } from "./models.js"
import type { TurnRow } from "./db.js"

const openai = new OpenAI({
  baseURL: "http://localhost:5001/v1",
  apiKey: "kobold",
})

const SYSTEM_PROMPT = `You are a creative and immersive text-based adventure game narrator.
Write in second-person present tense ("You push open the heavy door...").
Your prose is vivid, atmospheric, and character-driven.

RULES:
- Write 2-5 paragraphs of story continuation in narrative_text
- Never break the fourth wall or add meta-commentary
- Track all character/NPC state changes accurately
- Only include NPCs in npc_updates if their state actually changed this turn
- Only include fields in player_state_update if they actually changed
- new_npcs should only contain NPCs appearing for the first time
- world_state_update must always be fully populated with current scene, time, and a 2-3 sentence summary of recent events
- You MUST respond with valid JSON matching the provided schema exactly`

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
        `  Location: ${npc.last_known_location}\n` +
        `  Appearance: ${npc.appearance.physical_description}\n` +
        `  Wearing: ${npc.appearance.current_clothing}\n` +
        `  Relationship: ${npc.relationship_to_player}\n` +
        `  Personality: ${npc.personality_traits.join(", ")}\n` +
        `  Notes: ${npc.notes}`
    )
    .join("\n\n")
}

function formatRecentHistory(turns: TurnRow[], maxTurns = 8): string {
  if (turns.length === 0) return "This is the beginning of the story."
  const recent = turns.slice(-maxTurns)
  return recent
    .map((t) => `> Player: ${t.player_input}\n  Story: ${t.narrative_text.slice(0, 400)}${t.narrative_text.length > 400 ? "..." : ""}`)
    .join("\n\n")
}

export function buildTurnMessages(
  character: MainCharacterState,
  world: WorldState,
  npcs: NPCState[],
  recentTurns: TurnRow[],
  playerInput: string,
  actionMode: string
): OpenAI.ChatCompletionMessageParam[] {
  const npcSection =
    npcs.length > 0
      ? `\n=== KNOWN NPCs ===\n${formatNPCs(npcs)}`
      : ""

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
Name: ${character.name} (${character.gender})
Appearance: ${character.appearance.physical_description}
Wearing: ${character.appearance.current_clothing}
Traits: ${[...character.personality_traits, ...character.custom_traits].join(", ")}
Inventory: ${formatInventory(character.inventory)}${npcSection}

=== STORY SO FAR ===
${formatRecentHistory(recentTurns)}

${actionSection}`

  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: contextBlock },
  ]
}

export async function callLLM(messages: OpenAI.ChatCompletionMessageParam[]): Promise<TurnResponse> {
  const jsonSchema = zodToJsonSchema(TurnResponseSchema, { name: "TurnResponse" })

  const res = await openai.chat.completions.create({
    model: "local",
    messages,
    max_tokens: 1200,
    temperature: 0.8,
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "TurnResponse",
        schema: jsonSchema,
      },
    } as OpenAI.ResponseFormatJSONSchema,
  })

  const content = res.choices[0]?.message?.content
  if (!content) throw new Error("LLM returned empty response")

  return TurnResponseSchema.parse(JSON.parse(content))
}

export async function testConnection(): Promise<boolean> {
  try {
    await openai.models.list()
    return true
  } catch {
    return false
  }
}
