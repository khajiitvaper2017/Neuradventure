export interface InventoryItem {
  name: string
  description: string
}

export interface LocationItem {
  name: string
  description: string
}

export interface Location {
  name: string
  description: string
  characters: string[]
  available_items: LocationItem[]
}

export interface CharacterState {
  name: string
  race: string
  gender: string
  general_description: string
  current_location: string
  baseline_appearance: string
  current_appearance: string
  current_clothing: string
  personality_traits: string[]
  major_flaws: string[]
  quirks: string[]
  perks: string[]
  inventory: InventoryItem[]
}

export type MainCharacterState = CharacterState

export interface NPCState extends CharacterState {
  current_activity: string
}

export interface StoryModules {
  track_npcs: boolean
  track_locations: boolean
  character_appearance_clothing: boolean
  character_personality_traits: boolean
  character_major_flaws: boolean
  character_quirks: boolean
  character_perks: boolean
  character_inventory: boolean
  npc_appearance_clothing: boolean
  npc_personality_traits: boolean
  npc_major_flaws: boolean
  npc_quirks: boolean
  npc_perks: boolean
  npc_location: boolean
  npc_activity: boolean
}

export interface WorldState {
  current_scene: string
  time_of_day: string
  memory: string
  locations: Location[]
}

export interface StoryMeta {
  id: number
  title: string
  turn_count: number
  character_name: string
  created_at: string
  updated_at: string
}

export interface ChatSummary {
  id: number
  title: string
  message_count: number
  updated_at: string
  participants: string[]
  player_name: string
}

export interface ChatMember {
  id: number
  role: "player" | "ai"
  member_kind: "character" | "npc"
  character_id: number | null
  sort_order: number
  name: string
}

export interface ChatDetail {
  id: number
  title: string
  speaker_strategy: string
  next_speaker_index: number
  can_undo_cancel: boolean
  created_at: string
  updated_at: string
  members: ChatMember[]
}

export interface ChatMessage {
  id: number
  message_index: number
  speaker_member_id: number
  speaker_name: string
  role: "user" | "assistant" | "system"
  content: string
  created_at: string
}

export interface TurnSummary {
  id: number
  turn_number: number
  action_mode?: "do" | "say" | "story"
  active_variant_id?: number | null
  player_input: string
  narrative_text: string
  world: WorldState
  created_at: string
}

export interface TurnVariantSummary {
  id: number
  variant_index: number
  narrative_text: string
  created_at: string
}
