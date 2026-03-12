// Quick test to verify LLM integration. Run with: npm run test-llm
import { buildTurnMessages, callLLM, testConnection } from "./llm/index.js"
import type { MainCharacterState, NPCState, WorldState } from "./core/models.js"

const character: MainCharacterState = {
  name: "Kira Solene",
  race: "Human",
  gender: "female",
  current_location: "The Rusted Flagon tavern",
  appearance: {
    baseline_appearance: "172 cm, athletic build, dark braided hair, green eyes, olive skin",
    current_appearance: "172 cm, athletic build, dark braided hair, green eyes, olive skin",
    current_clothing: "worn leather armor, dark cloak",
  },
  personality_traits: ["Brave", "Curious"],
  major_flaws: ["Reckless in danger"],
  quirks: ["Counts exits on entry"],
  perks: ["Skilled tracker"],
  inventory: [{ name: "Dagger", description: "a small iron dagger" }],
}

const world: WorldState = {
  current_scene: "The Rusted Flagon tavern",
  current_date: "2026-03-11",
  time_of_day: "21:00",
  memory: "You arrived in the village of Ashford after a long journey through the rain.",
  locations: [
    {
      name: "The Rusted Flagon tavern",
      description: "Low-ceilinged taproom with smoke-stained beams and a crowded bar.",
      characters: ["Kira"],
      available_items: [
        { name: "Wooden stool", description: "scarred stool with a missing rung" },
        { name: "Tin mug", description: "dented mug with stale ale residue" },
      ],
    },
  ],
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
  const response = await callLLM(messages, npcs)
  console.log("\n=== LLM Response ===")
  console.log("Narrative:", response.narrative_text)
  console.log("\nWorld update:", response.world_state_update)
  console.log("Set current appearance:", response.set_current_appearance)
  console.log("Current clothing:", response.current_clothing)
  console.log("Set current inventory:", response.set_current_inventory)
  console.log("NPC changes:", response.npc_changes)
  console.log("NPC introductions:", response.npc_introductions)
}

main().catch(console.error)
