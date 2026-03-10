// Quick test to verify LLM integration. Run with: npm run test-llm
import { buildTurnMessages, callLLM, testConnection } from "./llm.js"
import type { MainCharacterState, NPCState, WorldState } from "./models.js"

const character: MainCharacterState = {
  name: "Kira",
  gender: "female",
  appearance: {
    physical_description: "tall, athletic, dark braided hair, green eyes",
    current_clothing: "worn leather armor, dark cloak",
  },
  personality_traits: ["brave", "curious"],
  custom_traits: ["grew up in the forest"],
  inventory: [{ name: "Dagger", description: "a small iron dagger" }],
}

const world: WorldState = {
  current_scene: "The Rusted Flagon tavern",
  day_of_week: "Tuesday",
  time_of_day: "21:00",
  recent_events_summary: "You arrived in the village of Ashford after a long journey through the rain.",
}

const npcs: NPCState[] = []

async function main() {
  console.log("Testing KoboldCpp connection...")
  const connected = await testConnection()
  if (!connected) {
    console.error("Cannot connect to KoboldCpp at http://localhost:5001. Is it running?")
    process.exit(1)
  }
  console.log("Connected!\n")

  console.log("Building prompt messages...")
  const messages = buildTurnMessages(character, world, npcs, [], "I look around the tavern.", "do")
  console.log("System:", messages[0].content)
  console.log("\nUser context:", messages[1].content)

  console.log("\nCalling LLM...")
  const response = await callLLM(messages)
  console.log("\n=== LLM Response ===")
  console.log("Narrative:", response.narrative_text)
  console.log("\nWorld update:", response.world_state_update)
  console.log("Player update:", response.player_state_update)
  console.log("NPC updates:", response.npc_updates)
}

main().catch(console.error)
