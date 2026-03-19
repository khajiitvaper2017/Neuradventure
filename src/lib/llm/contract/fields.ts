import { z } from "zod"
import type { CustomFieldDef } from "@/types/api"
import type { MainCharacterState, NPCState, WorldState } from "@/types/models"
import { CharacterRole } from "@/types/roles"
import type { StoryModuleKey } from "@/domain/story/module-definitions"
import { InventoryItemSchema } from "@/domain/story/schemas/game-state"
import { TIME_OF_DAY_REGEX } from "@/domain/story/schemas/constants"
import { formatTemplate, getLlmStrings, getServerDefaults } from "@/utils/text/strings"
import { isCustomFieldModuleEnabled } from "@/domain/story/custom-field-modules"
import { getFieldDescription } from "@/llm/contract/descriptions"

export type ContractRole = CharacterRole

export type FieldValueKind = "text" | "string_list" | "inventory" | "time"

export type CharacterFieldId =
  | "name"
  | "race"
  | "gender"
  | "general_description"
  | "baseline_appearance"
  | "current_appearance"
  | "current_clothing"
  | "current_location"
  | "current_activity"
  | "personality_traits"
  | "major_flaws"
  | "perks"
  | "memories"
  | "inventory"

export type WorldFieldId = "current_location" | "time_of_day"

export type FieldDefinition = {
  id: string
  descriptionKey: string
  kind: FieldValueKind
  moduleByRole?: Partial<Record<ContractRole, StoryModuleKey>>
  renderLabel?: {
    group: "contextLabels" | "characterContextLabels"
    key: string
  }
}

export type CompiledFieldDefinition = FieldDefinition & {
  description: string
  source: "builtin" | "custom"
}

const CHARACTER_FIELD_DEFS: Record<CharacterFieldId, FieldDefinition> = {
  name: {
    id: "name",
    descriptionKey: "state.character.name",
    kind: "text",
    renderLabel: { group: "characterContextLabels", key: "name" },
  },
  race: {
    id: "race",
    descriptionKey: "state.character.race",
    kind: "text",
    renderLabel: { group: "contextLabels", key: "race" },
  },
  gender: {
    id: "gender",
    descriptionKey: "state.character.gender",
    kind: "text",
    renderLabel: { group: "contextLabels", key: "gender" },
  },
  general_description: {
    id: "general_description",
    descriptionKey: "state.character.general_description",
    kind: "text",
    renderLabel: { group: "characterContextLabels", key: "generalDescription" },
  },
  baseline_appearance: {
    id: "baseline_appearance",
    descriptionKey: "state.character.baseline_appearance",
    kind: "text",
    moduleByRole: {
      [CharacterRole.Player]: "character_appearance_clothing",
      [CharacterRole.Npc]: "npc_appearance_clothing",
    },
    renderLabel: { group: "characterContextLabels", key: "baselineAppearance" },
  },
  current_appearance: {
    id: "current_appearance",
    descriptionKey: "state.character.current_appearance",
    kind: "text",
    moduleByRole: {
      [CharacterRole.Player]: "character_appearance_clothing",
      [CharacterRole.Npc]: "npc_appearance_clothing",
    },
    renderLabel: { group: "characterContextLabels", key: "currentAppearance" },
  },
  current_clothing: {
    id: "current_clothing",
    descriptionKey: "state.character.current_clothing",
    kind: "text",
    moduleByRole: {
      [CharacterRole.Player]: "character_appearance_clothing",
      [CharacterRole.Npc]: "npc_appearance_clothing",
    },
    renderLabel: { group: "contextLabels", key: "wearing" },
  },
  current_location: {
    id: "current_location",
    descriptionKey: "state.character.current_location",
    kind: "text",
    moduleByRole: {
      [CharacterRole.Player]: "character_location",
      [CharacterRole.Npc]: "npc_location",
    },
    renderLabel: { group: "characterContextLabels", key: "location" },
  },
  current_activity: {
    id: "current_activity",
    descriptionKey: "state.character.current_activity",
    kind: "text",
    moduleByRole: {
      [CharacterRole.Player]: "character_activity",
      [CharacterRole.Npc]: "npc_activity",
    },
    renderLabel: { group: "characterContextLabels", key: "currentActivity" },
  },
  personality_traits: {
    id: "personality_traits",
    descriptionKey: "traits.personality_traits",
    kind: "string_list",
    moduleByRole: {
      [CharacterRole.Player]: "character_personality_traits",
      [CharacterRole.Npc]: "npc_personality_traits",
    },
    renderLabel: { group: "contextLabels", key: "personalityTraits" },
  },
  major_flaws: {
    id: "major_flaws",
    descriptionKey: "traits.major_flaws",
    kind: "string_list",
    moduleByRole: {
      [CharacterRole.Player]: "character_major_flaws",
      [CharacterRole.Npc]: "npc_major_flaws",
    },
    renderLabel: { group: "contextLabels", key: "majorFlaws" },
  },
  perks: {
    id: "perks",
    descriptionKey: "traits.perks",
    kind: "string_list",
    moduleByRole: {
      [CharacterRole.Player]: "character_perks",
      [CharacterRole.Npc]: "npc_perks",
    },
    renderLabel: { group: "contextLabels", key: "perks" },
  },
  memories: {
    id: "memories",
    descriptionKey: "state.character.memories",
    kind: "string_list",
    moduleByRole: {
      [CharacterRole.Player]: "character_memories",
      [CharacterRole.Npc]: "npc_memories",
    },
    renderLabel: { group: "contextLabels", key: "memories" },
  },
  inventory: {
    id: "inventory",
    descriptionKey: "state.character.inventory",
    kind: "inventory",
    moduleByRole: {
      [CharacterRole.Player]: "character_inventory",
      [CharacterRole.Npc]: "npc_inventory",
    },
    renderLabel: { group: "contextLabels", key: "inventory" },
  },
}

const WORLD_FIELD_DEFS: Record<WorldFieldId, FieldDefinition> = {
  current_location: {
    id: "current_location",
    descriptionKey: "state.character.current_location",
    kind: "text",
    renderLabel: { group: "characterContextLabels", key: "location" },
  },
  time_of_day: {
    id: "time_of_day",
    descriptionKey: "llm.world_state_update.time_of_day",
    kind: "time",
    renderLabel: { group: "contextLabels", key: "time" },
  },
}

const BASE_CHARACTER_FIELD_IDS: CharacterFieldId[] = [
  "name",
  "race",
  "gender",
  "general_description",
  "baseline_appearance",
  "personality_traits",
  "major_flaws",
  "perks",
]

const CURRENT_CHARACTER_FIELD_IDS: CharacterFieldId[] = [
  "current_appearance",
  "current_clothing",
  "current_location",
  "current_activity",
  "memories",
  "inventory",
]

const CREATION_CHARACTER_FIELD_IDS: CharacterFieldId[] = [
  "name",
  "race",
  "gender",
  "general_description",
  "baseline_appearance",
  "current_appearance",
  "current_clothing",
  "current_location",
  "current_activity",
  "personality_traits",
  "major_flaws",
  "perks",
  "inventory",
]

export function listBaseCharacterFieldIds(): CharacterFieldId[] {
  return [...BASE_CHARACTER_FIELD_IDS]
}

export function listCurrentCharacterFieldIds(): CharacterFieldId[] {
  return [...CURRENT_CHARACTER_FIELD_IDS]
}

export function listCreationCharacterFieldIds(): CharacterFieldId[] {
  return [...CREATION_CHARACTER_FIELD_IDS]
}

export function getCharacterFieldDefinition(fieldId: CharacterFieldId): FieldDefinition {
  return CHARACTER_FIELD_DEFS[fieldId]
}

export function getWorldFieldDefinition(fieldId: WorldFieldId): FieldDefinition {
  return WORLD_FIELD_DEFS[fieldId]
}

export function isFieldEnabledForRole(
  fieldId: CharacterFieldId,
  role: ContractRole,
  modules: Record<string, boolean>,
): boolean {
  const moduleKey = CHARACTER_FIELD_DEFS[fieldId].moduleByRole?.[role]
  return moduleKey ? modules[moduleKey] === true : true
}

function buildFieldSchema(def: FieldDefinition, optional: boolean): z.ZodTypeAny {
  const description = getFieldDescription(def.descriptionKey)
  switch (def.kind) {
    case "string_list":
      return optional
        ? z.array(z.string().min(1)).min(1).optional().describe(description)
        : z.array(z.string().min(1)).describe(description)
    case "inventory":
      return optional
        ? z.array(InventoryItemSchema).optional().describe(description)
        : z.array(InventoryItemSchema).describe(description)
    case "time":
      return optional
        ? z.string().regex(TIME_OF_DAY_REGEX, "must be 24h HH:MM").optional().describe(description)
        : z.string().regex(TIME_OF_DAY_REGEX, "must be 24h HH:MM").describe(description)
    case "text":
    default:
      return optional ? z.string().min(1).optional().describe(description) : z.string().min(1).describe(description)
  }
}

export function buildCharacterFieldShape(
  fieldIds: CharacterFieldId[],
  role: ContractRole,
  modules: Record<string, boolean>,
  options?: { optional?: boolean },
): Record<string, z.ZodTypeAny> {
  const optional = options?.optional === true
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const fieldId of fieldIds) {
    if (!isFieldEnabledForRole(fieldId, role, modules)) continue
    shape[fieldId] = buildFieldSchema(CHARACTER_FIELD_DEFS[fieldId], optional)
  }
  return shape
}

export function buildWorldFieldShape(
  fieldIds: WorldFieldId[],
  options?: { optional?: boolean },
): Record<string, z.ZodTypeAny> {
  const optional = options?.optional === true
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const fieldId of fieldIds) {
    shape[fieldId] = buildFieldSchema(WORLD_FIELD_DEFS[fieldId], optional)
  }
  return shape
}

export function compileCustomCharacterFields(
  defs: CustomFieldDef[],
  role: ContractRole,
  modules: { custom_field_modules?: Record<string, { player?: boolean; npc?: boolean }> },
  options?: { placement?: "base" | "current" },
): CompiledFieldDefinition[] {
  const placement = options?.placement
  const fields: CompiledFieldDefinition[] = []
  const promptHints = getLlmStrings().promptHints
  for (const def of defs) {
    if (!def.enabled || def.scope !== "character") continue
    if (placement && def.placement !== placement) continue
    if (!isCustomFieldModuleEnabled(modules, def.id, role)) continue
    const description =
      (def.prompt ?? "").trim() ||
      formatTemplate(promptHints.customFieldFallback.character, { label: def.label, id: def.id })
    fields.push({
      id: def.id,
      descriptionKey: `state.character.custom_fields.${def.id}`,
      kind: def.value_type === "list" ? "string_list" : "text",
      description,
      source: "custom",
    })
  }
  return fields
}

export function compileCustomWorldFields(defs: CustomFieldDef[]): CompiledFieldDefinition[] {
  const fields: CompiledFieldDefinition[] = []
  const promptHints = getLlmStrings().promptHints
  for (const def of defs) {
    if (!def.enabled || def.scope !== "world") continue
    const description =
      (def.prompt ?? "").trim() ||
      formatTemplate(promptHints.customFieldFallback.world, { label: def.label, id: def.id })
    fields.push({
      id: def.id,
      descriptionKey: `llm.world_state_update.custom_fields.${def.id}`,
      kind: def.value_type === "list" ? "string_list" : "text",
      description,
      source: "custom",
    })
  }
  return fields
}

export function buildCustomFieldShape(
  fields: CompiledFieldDefinition[],
  options?: { optional?: boolean },
): Record<string, z.ZodTypeAny> {
  const optional = options?.optional === true
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const field of fields) {
    switch (field.kind) {
      case "string_list":
        shape[field.id] = optional
          ? z.array(z.string().min(1)).min(1).optional().describe(field.description)
          : z.array(z.string().min(1)).min(1).describe(field.description)
        break
      case "text":
      default:
        shape[field.id] = optional
          ? z.string().min(1).optional().describe(field.description)
          : z.string().min(1).describe(field.description)
        break
    }
  }
  return shape
}

function formatInventoryValue(inventory: MainCharacterState["inventory"] | NPCState["inventory"]): string {
  if (inventory.length === 0) return getServerDefaults().format.nothing
  return inventory.map((item) => `${item.name} (${item.description})`).join(", ")
}

function formatMemoriesValue(memories: MainCharacterState["memories"] | NPCState["memories"]): string {
  const defaults = getServerDefaults()
  if (memories.length === 0) return defaults.format.noneLower
  return memories.map((memory) => `- ${memory}`).join("\n")
}

export function renderCharacterContextLine(
  fieldId: CharacterFieldId,
  character: MainCharacterState | NPCState,
): string | null {
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const def = CHARACTER_FIELD_DEFS[fieldId]
  if (!def.renderLabel) return null

  const labels =
    def.renderLabel.group === "characterContextLabels" ? llmStrings.characterContextLabels : llmStrings.contextLabels
  const template = labels[def.renderLabel.key as keyof typeof labels]
  if (!template) return null

  switch (fieldId) {
    case "name":
    case "race":
    case "gender":
      return formatTemplate(template, { value: String(character[fieldId] ?? "").trim() || defaults.unknown.value })
    case "general_description":
      return formatTemplate(template, {
        value: character.general_description?.trim() || defaults.unknown.generalDescription,
      })
    case "baseline_appearance":
      return formatTemplate(template, {
        value: character.baseline_appearance?.trim() || defaults.unknown.baselineAppearance,
      })
    case "current_appearance":
      return formatTemplate(template, {
        value: character.current_appearance?.trim() || defaults.unknown.appearance,
      })
    case "current_clothing":
      return formatTemplate(template, {
        value: character.current_clothing?.trim() || defaults.unknown.clothing,
      })
    case "current_location":
      return formatTemplate(template, {
        value: character.current_location?.trim() || defaults.unknown.location,
      })
    case "current_activity":
      return formatTemplate(template, {
        value: character.current_activity?.trim() || defaults.unknown.activity,
      })
    case "personality_traits":
    case "major_flaws":
    case "perks":
      return formatTemplate(template, {
        value: character[fieldId].join(", ") || defaults.format.noneLower,
      })
    case "memories":
      return formatTemplate(template, { value: formatMemoriesValue(character.memories) })
    case "inventory":
      return formatTemplate(template, { value: formatInventoryValue(character.inventory) })
    default:
      return null
  }
}

export function renderWorldContextLine(fieldId: WorldFieldId, world: WorldState): string | null {
  const llmStrings = getLlmStrings()
  const defaults = getServerDefaults()
  const def = WORLD_FIELD_DEFS[fieldId]
  if (!def.renderLabel) return null

  const labels = llmStrings[def.renderLabel.group]
  const template = labels[def.renderLabel.key as keyof typeof labels]
  if (!template) return null

  switch (fieldId) {
    case "current_location":
      return formatTemplate(template, { value: world.current_location?.trim() || defaults.unknown.location })
    case "time_of_day":
      return formatTemplate(template, { value: world.time_of_day?.trim() || defaults.defaultTimeOfDay })
    default:
      return null
  }
}
