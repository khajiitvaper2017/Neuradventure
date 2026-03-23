import type { StoryModules } from "@/types/types"

export type StoryModuleSectionId = "core" | "player" | "npcs"

export type ModuleDefinition = {
  id: string
  section: StoryModuleSectionId
  title: string
  sub?: string
  sharedNote?: string
  promptKeys: readonly string[]
}

type StoryModuleFieldRowDefinition = {
  id: string
  title: string
  sub: string
  characterKey: string
  npcKey: string
  promptKey: string
  characterPromptKeys: readonly string[]
  npcPromptKeys: readonly string[]
  sharedNote?: string
}

function indexModuleDefs<const T extends readonly ModuleDefinition[]>(
  defs: T,
): Record<T[number]["id"], ModuleDefinition> {
  return Object.fromEntries(defs.map((def) => [def.id, def])) as Record<T[number]["id"], ModuleDefinition>
}

function makeRoleModuleTitle(role: "Player" | "NPC", title: string): string {
  if (!title) return role
  return `${role} ${title.charAt(0).toLowerCase()}${title.slice(1)}`
}

const STORY_MODULE_FIELD_ROW_DEFS = [
  {
    id: "appearance",
    title: "Appearance + clothing",
    sub: "Track and update appearance/clothing fields",
    characterKey: "character_appearance_clothing",
    npcKey: "npc_appearance_clothing",
    promptKey: "character_appearance_clothing",
    characterPromptKeys: [
      "state.character.baseline_appearance",
      "state.character.current_appearance",
      "state.character.current_clothing",
    ],
    npcPromptKeys: [
      "state.character.baseline_appearance",
      "state.character.current_appearance",
      "state.character.current_clothing",
    ],
    sharedNote: "Shared prompts (same descriptions used for player + NPC appearance/clothing guidance).",
  },
  {
    id: "personality_traits",
    title: "Personality traits",
    sub: "Track and update personality traits",
    characterKey: "character_personality_traits",
    npcKey: "npc_personality_traits",
    promptKey: "character_personality_traits",
    characterPromptKeys: ["traits.entry", "traits.personality_traits"],
    npcPromptKeys: ["traits.entry", "traits.personality_traits"],
    sharedNote: "Shared prompts (same trait guidance used for player + NPCs).",
  },
  {
    id: "major_flaws",
    title: "Major flaws",
    sub: "Track and update major flaws",
    characterKey: "character_major_flaws",
    npcKey: "npc_major_flaws",
    promptKey: "character_major_flaws",
    characterPromptKeys: ["traits.entry", "traits.major_flaws"],
    npcPromptKeys: ["traits.entry", "traits.major_flaws"],
    sharedNote: "Shared prompts (same trait guidance used for player + NPCs).",
  },
  {
    id: "perks",
    title: "Perks",
    sub: "Track and update perks",
    characterKey: "character_perks",
    npcKey: "npc_perks",
    promptKey: "character_perks",
    characterPromptKeys: ["traits.entry", "traits.perks"],
    npcPromptKeys: ["traits.entry", "traits.perks"],
    sharedNote: "Shared prompts (same trait guidance used for player + NPCs).",
  },
  {
    id: "inventory",
    title: "Inventory",
    sub: "Track and update the inventory list",
    characterKey: "character_inventory",
    npcKey: "npc_inventory",
    promptKey: "character_inventory",
    characterPromptKeys: [
      "state.character.inventory",
      "state.inventory_item.entry",
      "state.inventory_item.name",
      "state.inventory_item.description",
    ],
    npcPromptKeys: [
      "state.character.inventory",
      "state.inventory_item.entry",
      "state.inventory_item.name",
      "state.inventory_item.description",
    ],
    sharedNote: "Shared prompts (same inventory guidance used for player + NPCs).",
  },
  {
    id: "memories",
    title: "Memories",
    sub: "Track long-tail memories worth recalling 5-10 turns later",
    characterKey: "character_memories",
    npcKey: "npc_memories",
    promptKey: "character_memories",
    characterPromptKeys: ["state.character.memories", "llm.character_update.new_memories"],
    npcPromptKeys: ["state.character.memories", "llm.character_update.new_memories"],
    sharedNote: "Shared prompts (same memory guidance used for player + NPCs).",
  },
  {
    id: "location",
    title: "Location",
    sub: "Track and update current location",
    characterKey: "character_location",
    npcKey: "npc_location",
    promptKey: "npc_location",
    characterPromptKeys: ["state.character.current_location"],
    npcPromptKeys: ["llm.character_update.current_location", "state.character.current_location"],
  },
  {
    id: "activity",
    title: "Activity",
    sub: "Track and update current activity",
    characterKey: "character_activity",
    npcKey: "npc_activity",
    promptKey: "npc_activity",
    characterPromptKeys: ["state.character.current_activity"],
    npcPromptKeys: ["llm.character_update.current_activity", "state.character.current_activity"],
  },
] as const satisfies readonly StoryModuleFieldRowDefinition[]

function buildStoryModuleDefsFromRows(rows: readonly StoryModuleFieldRowDefinition[]): ModuleDefinition[] {
  return rows.flatMap((row) => [
    {
      id: row.characterKey,
      section: "player",
      title: makeRoleModuleTitle("Player", row.title),
      sub: row.sub,
      promptKeys: row.characterPromptKeys,
    },
    {
      id: row.npcKey,
      section: "npcs",
      title: makeRoleModuleTitle("NPC", row.title),
      sub: row.sub,
      sharedNote: row.sharedNote,
      promptKeys: row.npcPromptKeys,
    },
  ])
}

export const MODULE_DEFS = [
  {
    id: "track_npcs",
    section: "core",
    title: "Track NPCs",
    sub: "New stories track NPC state and updates",
    promptKeys: [
      "generation.story.character_introductions",
      "llm.turn_response.character_introductions",
      "llm.character_update.entry",
    ],
  },
  {
    id: "track_background_events",
    section: "core",
    title: "Track background events",
    sub: "Generate hidden off-screen events per turn",
    promptKeys: ["llm.turn_response.background_events"],
  },
  ...buildStoryModuleDefsFromRows(STORY_MODULE_FIELD_ROW_DEFS),
] as const satisfies readonly ModuleDefinition[]

export type StoryModuleKey = (typeof MODULE_DEFS)[number]["id"]
export const MODULE_DEFS_BY_ID = indexModuleDefs(MODULE_DEFS)
export const STORY_MODULE_PROMPT_KEYS = MODULE_DEFS.flatMap((def) => def.promptKeys) as string[]

export const STORY_MODULE_KEYS = MODULE_DEFS.map((def) => def.id) as StoryModuleKey[]

export const PLAYER_MODULE_KEYS = MODULE_DEFS.filter((def) => def.section === "player").map(
  (def) => def.id,
) as StoryModuleKey[]
export const NPC_MODULE_KEYS = MODULE_DEFS.filter((def) => def.section === "npcs").map(
  (def) => def.id,
) as StoryModuleKey[]
export const STORY_MODULE_FIELD_ROWS = STORY_MODULE_FIELD_ROW_DEFS

export type StoryModuleSection = {
  id: StoryModuleSectionId
  title: string
  keys: readonly StoryModuleKey[]
}

export const STORY_MODULE_SECTIONS: readonly StoryModuleSection[] = [
  {
    id: "core",
    title: "Core",
    keys: MODULE_DEFS.filter((def) => def.section === "core").map((def) => def.id) as StoryModuleKey[],
  },
  { id: "player", title: "Player", keys: [...PLAYER_MODULE_KEYS] },
  { id: "npcs", title: "NPCs", keys: [...NPC_MODULE_KEYS] },
] as const

export function countEnabled(modules: StoryModules, keys: readonly StoryModuleKey[]): number {
  return keys.reduce((acc, key) => acc + (modules[key] === true ? 1 : 0), 0)
}

export function countAllEnabled(modules: StoryModules): number {
  return Object.values(modules).reduce((acc, value) => acc + (value === true ? 1 : 0), 0)
}

export function storyModulesPreviewCore(modules: StoryModules): string {
  return `Core: ${modules.track_npcs ? "NPCs on" : "NPCs off"} · Background events: ${
    modules.track_background_events ? "on" : "off"
  } · Appearance: ${modules.character_appearance_clothing ? "on" : "off"}`
}

export function storyModulesPreviewPlayer(modules: StoryModules): string {
  return `Player fields: ${countEnabled(modules, PLAYER_MODULE_KEYS)}/${PLAYER_MODULE_KEYS.length}`
}

export function storyModulesPreviewNpc(modules: StoryModules): string {
  return modules.track_npcs
    ? `NPC fields: ${countEnabled(modules, NPC_MODULE_KEYS)}/${NPC_MODULE_KEYS.length}`
    : "NPC fields: — (tracking off)"
}
