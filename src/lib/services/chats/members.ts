import * as db from "@/db/core"
import { getServerDefaults } from "@/utils/text/strings"
import type { ChatMember } from "@/llm/chat"
import { LlmRole } from "@/types/roles"
import { TavernCardV2Schema, type TavernCardV2 } from "@/utils/converters/tavern"

export function parseMemberState(raw: string): db.ChatMemberState | null {
  try {
    return JSON.parse(raw) as db.ChatMemberState
  } catch {
    return null
  }
}

export function memberNameFromState(state: db.ChatMemberState | null): string {
  const defaults = getServerDefaults()
  if (!state) return defaults.unknown.value
  return state.name?.trim() || defaults.unknown.value
}

function defaultMemberState(): db.ChatMemberState {
  const defaults = getServerDefaults()
  const base = {
    name: defaults.unknown.value,
    race: "",
    gender: "",
    general_description: defaults.unknown.generalDescription,
    current_location: "",
    current_activity: "",
    baseline_appearance: "",
    current_appearance: "",
    current_clothing: "",
    personality_traits: [],
    major_flaws: [],
    perks: [],
    memories: [],
    custom_fields: {},
  }
  return base
}

export function resolveMemberState(member: db.ChatMemberRow): db.ChatMemberState {
  const parsed = parseMemberState(member.state_json)
  if (parsed) return parsed
  return defaultMemberState()
}

export function buildChatMembersForPrompt(members: db.ChatMemberRow[]): ChatMember[] {
  return members.map((member) => ({
    id: member.id,
    role: member.role,
    sort_order: member.sort_order,
    state: parseMemberState(member.state_json) ?? defaultMemberState(),
  }))
}

export function listAiMembers(members: db.ChatMemberRow[]) {
  return members.filter((m) => m.role === LlmRole.Assistant).sort((a, b) => a.sort_order - b.sort_order)
}

export function resolveSpeakerCard(member: db.ChatMemberRow): TavernCardV2 | null {
  if (!member.character_id) return null
  const row = db.getCharacterCard(member.character_id)
  if (!row) return null
  try {
    const stored = JSON.parse(row.card_json) as unknown
    return TavernCardV2Schema.parse(stored)
  } catch {
    return null
  }
}
