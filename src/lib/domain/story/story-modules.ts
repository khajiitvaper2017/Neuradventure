import type { StoryModules } from "@/types/types"

export type StoryModuleKey = keyof StoryModules

export type StoryModuleMeta = {
  title: string
  sub?: string
  requiresTrackNpcs?: boolean
}

export const STORY_MODULE_META: Record<StoryModuleKey, StoryModuleMeta> = {
  track_npcs: { title: "Track NPCs", sub: "New stories track NPC state and updates" },
  track_background_events: {
    title: "Track background events",
    sub: "Generate hidden off-screen events per turn",
  },
  character_appearance_clothing: {
    title: "Player appearance + clothing",
    sub: "Show and update appearance/clothing fields",
  },
  character_personality_traits: {
    title: "Player personality traits",
    sub: "Track and update personality traits",
  },
  character_major_flaws: { title: "Player major flaws", sub: "Track and update major flaws" },
  character_perks: { title: "Player perks", sub: "Track and update perks" },
  character_inventory: { title: "Player inventory", sub: "Track and update the inventory list" },
  npc_appearance_clothing: {
    title: "NPC appearance + clothing",
    sub: "Track and update appearance/clothing fields",
    requiresTrackNpcs: true,
  },
  npc_personality_traits: {
    title: "NPC personality traits",
    sub: "Track and update personality traits",
    requiresTrackNpcs: true,
  },
  npc_major_flaws: { title: "NPC major flaws", sub: "Track and update major flaws", requiresTrackNpcs: true },
  npc_perks: { title: "NPC perks", sub: "Track and update perks", requiresTrackNpcs: true },
  npc_location: { title: "NPC location", sub: "Track and update current location", requiresTrackNpcs: true },
  npc_activity: { title: "NPC activity", sub: "Track and update current activity", requiresTrackNpcs: true },
}

export type StoryModuleSection = {
  id: "core" | "player" | "npcs"
  title: string
  keys: readonly StoryModuleKey[]
}

export const STORY_MODULE_SECTIONS: readonly StoryModuleSection[] = [
  {
    id: "core",
    title: "Core",
    keys: ["track_npcs", "track_background_events"],
  },
  {
    id: "player",
    title: "Player",
    keys: [
      "character_appearance_clothing",
      "character_personality_traits",
      "character_major_flaws",
      "character_perks",
      "character_inventory",
    ],
  },
  {
    id: "npcs",
    title: "NPCs",
    keys: [
      "npc_appearance_clothing",
      "npc_personality_traits",
      "npc_major_flaws",
      "npc_perks",
      "npc_location",
      "npc_activity",
    ],
  },
] as const

export const PLAYER_MODULE_KEYS = [
  "character_appearance_clothing",
  "character_personality_traits",
  "character_major_flaws",
  "character_perks",
  "character_inventory",
] as const satisfies readonly StoryModuleKey[]

export const NPC_MODULE_KEYS = [
  "npc_appearance_clothing",
  "npc_personality_traits",
  "npc_major_flaws",
  "npc_perks",
  "npc_location",
  "npc_activity",
] as const satisfies readonly StoryModuleKey[]

export function countEnabled(modules: StoryModules, keys: readonly StoryModuleKey[]): number {
  return keys.reduce((acc, k) => acc + (modules[k] === true ? 1 : 0), 0)
}

export function countAllEnabled(modules: StoryModules): number {
  return Object.values(modules).reduce((acc, v) => acc + (v ? 1 : 0), 0)
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
