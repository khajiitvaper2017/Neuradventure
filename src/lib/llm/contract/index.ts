import { z } from "zod"
import * as db from "@/db/core"
import { isEngineDbInitialized } from "@/db/connection"
import type { CustomFieldDef } from "@/types/api"
import type { StoryModules } from "@/types/models"
import { CharacterRole } from "@/types/roles"
import { STORY_MODULE_KEYS } from "@/domain/story/module-definitions"
import { DEFAULT_STORY_MODULES } from "@/domain/story/schemas/story-modules"
import { getFieldDescription } from "@/llm/contract/descriptions"
import { formatTemplate, getLlmStrings } from "@/utils/text/strings"
import {
  buildCharacterFieldShape,
  buildCustomFieldShape,
  buildWorldFieldShape,
  compileCustomCharacterFields,
  compileCustomWorldFields,
  getCharacterFieldDefinition,
  getWorldFieldDefinition,
  listBaseCharacterFieldIds,
  listCreationCharacterFieldIds,
  listCurrentCharacterFieldIds,
  isFieldEnabledForRole,
  type CompiledFieldDefinition,
  type ContractRole,
  type CharacterFieldId,
} from "@/llm/contract/fields"

export type LlmRequestKind = "turn" | "story_setup" | "character_generation" | "character_creation"

export type CompiledFieldSet = {
  player: {
    base: CompiledFieldDefinition[]
    current: CompiledFieldDefinition[]
    customBase: CompiledFieldDefinition[]
    customCurrent: CompiledFieldDefinition[]
  }
  npc: {
    base: CompiledFieldDefinition[]
    current: CompiledFieldDefinition[]
    creation: CompiledFieldDefinition[]
    customBase: CompiledFieldDefinition[]
    customCurrent: CompiledFieldDefinition[]
    customCreation: CompiledFieldDefinition[]
  }
  world: {
    context: CompiledFieldDefinition[]
    customContext: CompiledFieldDefinition[]
    customUpdate: CompiledFieldDefinition[]
  }
}

export type CompiledLlmContract = {
  kind: LlmRequestKind
  schemaName: string
  zodSchema: z.ZodTypeAny
  previewKeys: string[]
  builtInUpdateKeys: {
    player: string[]
    npc: string[]
  }
  promptHints: {
    enabledPlayerFields: string[]
    enabledNpcFields: string[]
    enabledWorldFields: string[]
    outputShapeLines: string[]
  }
  fieldSet: CompiledFieldSet
}

type BuildLlmContractInput = {
  modules?: StoryModules
  customFieldDefs?: CustomFieldDef[]
  playerName?: string
  knownNpcNames?: string[]
}

function getModuleState(modules: StoryModules): Record<string, boolean> {
  const state: Record<string, boolean> = {}
  for (const key of STORY_MODULE_KEYS) state[key] = modules[key] === true
  return state
}

function mergeModules(modules?: StoryModules): StoryModules {
  return { ...DEFAULT_STORY_MODULES, ...(modules ?? {}) }
}

function getCustomFieldDefs(customFieldDefs?: CustomFieldDef[]): CustomFieldDef[] {
  if (customFieldDefs) return customFieldDefs
  if (!isEngineDbInitialized()) return []
  return db.listCustomFields()
}

function buildContextField(fieldId: "current_location" | "time_of_day"): CompiledFieldDefinition {
  const def = getWorldFieldDefinition(fieldId)
  return {
    id: def.id,
    descriptionKey: def.descriptionKey,
    description: getFieldDescription(def.descriptionKey),
    kind: def.kind,
    source: "builtin",
  }
}

function compileBuiltInFields(
  fieldIds: CharacterFieldId[],
  role: ContractRole,
  modules: Record<string, boolean>,
): CompiledFieldDefinition[] {
  return fieldIds
    .filter((fieldId) => isFieldEnabledForRole(fieldId, role, modules))
    .map((fieldId) => {
      const def = getCharacterFieldDefinition(fieldId)
      return {
        id: def.id,
        descriptionKey: def.descriptionKey,
        description: getFieldDescription(def.descriptionKey),
        kind: def.kind,
        source: "builtin",
      }
    })
}

function buildCharacterPatchSchema(
  fieldIds: CharacterFieldId[],
  role: ContractRole,
  customFields: CompiledFieldDefinition[],
  modules: Record<string, boolean>,
): z.ZodType<Record<string, unknown>> {
  const updateFieldIds = fieldIds.filter((fieldId) => fieldId !== "memories")
  const builtInShape = buildCharacterFieldShape(updateFieldIds, role, modules, { optional: true })
  const customShape = buildCustomFieldShape(customFields, { optional: true })
  const memoryShape = isFieldEnabledForRole("memories", role, modules)
    ? {
        new_memories: z
          .array(z.string().min(1))
          .min(1)
          .optional()
          .describe(getFieldDescription("llm.character_update.new_memories")),
      }
    : {}
  return z
    .object({
      ...builtInShape,
      ...memoryShape,
      ...customShape,
    })
    .strict()
    .refine((value) => Object.values(value).some((entry) => entry !== undefined), {
      message: "Include at least one changed field.",
    }) as z.ZodType<Record<string, unknown>>
}

function buildWorldStateUpdateSchema(customUpdateFields: CompiledFieldDefinition[]): z.ZodTypeAny {
  const baseShape = buildWorldFieldShape(["time_of_day"], { optional: true })
  return z
    .object({
      ...baseShape,
      custom_fields: z
        .object(buildCustomFieldShape(customUpdateFields, { optional: true }))
        .strict()
        .optional()
        .describe(getFieldDescription("llm.world_state_update.custom_fields")),
    })
    .strict()
    .describe(getFieldDescription("llm.turn_response.world_state_update"))
}

function buildCharacterCreationSchema(
  fieldIds: CharacterFieldId[],
  role: ContractRole,
  customCreationFields: CompiledFieldDefinition[],
  modules: Record<string, boolean>,
): z.ZodTypeAny {
  const builtInShape = buildCharacterFieldShape(fieldIds, role, modules)
  const customShape = buildCustomFieldShape(customCreationFields, { optional: true })
  return z
    .object({
      ...builtInShape,
      ...(Object.keys(customShape).length > 0
        ? {
            custom_fields: z
              .object(customShape)
              .strict()
              .optional()
              .describe(getFieldDescription("state.character.custom_fields")),
          }
        : {}),
    })
    .strict()
}

function buildCharacterRequestSchemas(
  fieldSet: CompiledFieldSet,
  moduleState: Record<string, boolean>,
  options: { excludeInventoryForPlayer?: boolean } = {},
): {
  playerPatch: z.ZodTypeAny
  npcPatch: z.ZodTypeAny
  npcCreation: z.ZodTypeAny
} {
  const playerFieldIds = fieldSet.player.current
    .map((field) => field.id as CharacterFieldId)
    .filter((fieldId) => (options.excludeInventoryForPlayer === true ? fieldId !== "inventory" : true))

  return {
    playerPatch: buildCharacterPatchSchema(
      playerFieldIds,
      CharacterRole.Player,
      fieldSet.player.customCurrent,
      moduleState,
    ),
    npcPatch: buildCharacterPatchSchema(
      fieldSet.npc.current.map((field) => field.id as CharacterFieldId),
      CharacterRole.Npc,
      fieldSet.npc.customCurrent,
      moduleState,
    ),
    npcCreation: buildCharacterCreationSchema(
      fieldSet.npc.creation.map((field) => field.id as CharacterFieldId),
      CharacterRole.Npc,
      fieldSet.npc.customCreation,
      moduleState,
    ),
  }
}

function buildNamedCharacterPatchEntries(
  playerName: string,
  knownNpcNames: string[],
  playerPatch: z.ZodTypeAny,
  npcPatch: z.ZodTypeAny,
  includeNpcEntries: boolean,
): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {}
  const trimmedPlayerName = playerName.trim()
  if (trimmedPlayerName) {
    shape[trimmedPlayerName] = playerPatch
      .optional()
      .describe(`${getFieldDescription("llm.character_update.entry")} Exact character: ${trimmedPlayerName}.`)
  }

  if (includeNpcEntries) {
    const seen = new Set(trimmedPlayerName ? [trimmedPlayerName.toLowerCase()] : [])
    for (const rawName of knownNpcNames) {
      const name = rawName.trim()
      if (!name || seen.has(name.toLowerCase())) continue
      seen.add(name.toLowerCase())
      shape[name] = npcPatch
        .optional()
        .describe(`${getFieldDescription("llm.character_update.entry")} Exact character: ${name}.`)
    }
  }

  return shape
}

function buildTurnSchema(
  modules: StoryModules,
  moduleState: Record<string, boolean>,
  playerName: string,
  knownNpcNames: string[],
  fieldSet: CompiledFieldSet,
): z.ZodTypeAny {
  const { playerPatch, npcPatch, npcCreation } = buildCharacterRequestSchemas(fieldSet, moduleState)

  const shape: Record<string, z.ZodTypeAny> = {
    narrative_text: z.string().min(1).describe(getFieldDescription("llm.turn_response.narrative_text")),
    world_state_update: buildWorldStateUpdateSchema(fieldSet.world.customUpdate),
  }

  if (modules.track_background_events) {
    shape.background_events = z
      .preprocess((value) => {
        if (typeof value !== "string") return value
        const trimmed = value.trim()
        return trimmed.length > 0 ? trimmed : undefined
      }, z.string().min(1))
      .optional()
      .describe(getFieldDescription("llm.turn_response.background_events"))
  }

  if (modules.track_npcs) {
    shape.character_introductions = z
      .array(npcCreation)
      .optional()
      .describe(getFieldDescription("llm.turn_response.character_introductions"))
  }

  Object.assign(
    shape,
    buildNamedCharacterPatchEntries(playerName, knownNpcNames, playerPatch, npcPatch, modules.track_npcs),
  )

  return z.object(shape).strict()
}

function buildStorySetupSchema(
  modules: StoryModules,
  moduleState: Record<string, boolean>,
  playerName: string,
  knownNpcNames: string[],
  fieldSet: CompiledFieldSet,
): z.ZodTypeAny {
  const { playerPatch, npcPatch, npcCreation } = buildCharacterRequestSchemas(fieldSet, moduleState, {
    excludeInventoryForPlayer: true,
  })

  const shape: Record<string, z.ZodTypeAny> = {
    title: z.string().min(1).describe(getFieldDescription("generation.story.title")),
    opening_scenario: z.string().min(1).describe(getFieldDescription("generation.story.opening_scenario")),
    starting_location: z.string().min(1).describe(getFieldDescription("generation.story.starting_location")),
    starting_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .describe(getFieldDescription("generation.story.starting_date")),
    starting_time: z
      .string()
      .regex(/^\d{2}:\d{2}$/)
      .describe(getFieldDescription("generation.story.starting_time")),
    general_description: z.string().min(1).describe(getFieldDescription("state.character.general_description")),
    character_introductions: modules.track_npcs
      ? z.array(npcCreation).optional().describe(getFieldDescription("generation.story.character_introductions"))
      : z
          .array(npcCreation)
          .max(0)
          .optional()
          .describe(getFieldDescription("generation.story.character_introductions")),
  }

  Object.assign(
    shape,
    buildNamedCharacterPatchEntries(playerName, knownNpcNames, playerPatch, npcPatch, modules.track_npcs),
  )

  return z.object(shape).strict()
}

function buildPromptHints(
  kind: LlmRequestKind,
  modules: StoryModules,
  playerName: string,
  knownNpcNames: string[],
  fieldSet: CompiledFieldSet,
): CompiledLlmContract["promptHints"] {
  const promptHints = getLlmStrings().promptHints
  const includeMemoryFields = kind === "turn"
  const visiblePlayerFields = [
    ...fieldSet.player.base,
    ...fieldSet.player.current,
    ...fieldSet.player.customBase,
    ...fieldSet.player.customCurrent,
  ].filter((field) => includeMemoryFields || field.id !== "memories")
  const visibleNpcFields = [
    ...fieldSet.npc.base,
    ...fieldSet.npc.current,
    ...fieldSet.npc.customBase,
    ...fieldSet.npc.customCurrent,
  ].filter((field) => includeMemoryFields || field.id !== "memories")
  const enabledPlayerFields = [...visiblePlayerFields].map((field) => field.id)
  const enabledNpcFields = [...visibleNpcFields].map((field) => field.id)
  const enabledWorldFields = [...fieldSet.world.context, ...fieldSet.world.customContext].map((field) => field.id)

  const outputShapeLines: string[] = []
  if (kind === "turn" || kind === "story_setup") {
    outputShapeLines.push(...promptHints.outputShape.turnOrStoryBase)
  }
  if (modules.track_npcs && (kind === "turn" || kind === "story_setup")) {
    outputShapeLines.push(promptHints.outputShape.turnOrStoryNpcIntroductions)
  }
  if ((kind === "turn" || kind === "story_setup") && playerName.trim()) {
    outputShapeLines.push(formatTemplate(promptHints.outputShape.playerKey, { value: playerName.trim() }))
  }
  if ((kind === "turn" || kind === "story_setup") && modules.track_npcs && knownNpcNames.length > 0) {
    outputShapeLines.push(
      formatTemplate(promptHints.outputShape.knownNpcKeys, {
        value: knownNpcNames
          .map((name) => `"${name.trim()}"`)
          .filter(Boolean)
          .join(", "),
      }),
    )
  }

  return { enabledPlayerFields, enabledNpcFields, enabledWorldFields, outputShapeLines }
}

export function buildLlmContract(kind: LlmRequestKind, input: BuildLlmContractInput = {}): CompiledLlmContract {
  const modules = mergeModules(input.modules)
  const moduleState = getModuleState(modules)
  const customFieldDefs = getCustomFieldDefs(input.customFieldDefs)
  const playerName = input.playerName?.trim() ?? ""
  const knownNpcNames = input.knownNpcNames?.map((name) => name.trim()).filter(Boolean) ?? []

  const playerBaseCustom = compileCustomCharacterFields(customFieldDefs, CharacterRole.Player, modules, {
    placement: "base",
  })
  const playerCurrentCustom = compileCustomCharacterFields(customFieldDefs, CharacterRole.Player, modules, {
    placement: "current",
  })
  const npcBaseCustom = compileCustomCharacterFields(customFieldDefs, CharacterRole.Npc, modules, {
    placement: "base",
  })
  const npcCurrentCustom = compileCustomCharacterFields(customFieldDefs, CharacterRole.Npc, modules, {
    placement: "current",
  })
  const npcCreationCustom = compileCustomCharacterFields(customFieldDefs, CharacterRole.Npc, modules)
  const worldContextCustom = compileCustomWorldFields(customFieldDefs)
  const worldUpdateCustom = compileCustomWorldFields(customFieldDefs)

  const playerBase = compileBuiltInFields(listBaseCharacterFieldIds(), CharacterRole.Player, moduleState)
  const playerCurrent = compileBuiltInFields(listCurrentCharacterFieldIds(), CharacterRole.Player, moduleState)
  const npcBase = compileBuiltInFields(listBaseCharacterFieldIds(), CharacterRole.Npc, moduleState)
  const npcCurrent = compileBuiltInFields(listCurrentCharacterFieldIds(), CharacterRole.Npc, moduleState)
  const npcCreation = compileBuiltInFields(listCreationCharacterFieldIds(), CharacterRole.Npc, moduleState)

  const fieldSet: CompiledFieldSet = {
    player: {
      base: playerBase,
      current: playerCurrent,
      customBase: playerBaseCustom,
      customCurrent: playerCurrentCustom,
    },
    npc: {
      base: npcBase,
      current: npcCurrent,
      creation: npcCreation,
      customBase: npcBaseCustom,
      customCurrent: npcCurrentCustom,
      customCreation: npcCreationCustom,
    },
    world: {
      context: [buildContextField("current_location"), buildContextField("time_of_day")],
      customContext: worldContextCustom,
      customUpdate: worldUpdateCustom,
    },
  }

  let schemaName = "TurnResponse"
  let zodSchema: z.ZodTypeAny
  let previewKeys: string[] = []

  if (kind === "turn") {
    schemaName = "TurnResponse"
    zodSchema = buildTurnSchema(modules, moduleState, playerName, knownNpcNames, fieldSet)
    previewKeys = [playerName, "narrative_text", "background_events", "time_of_day"].filter(Boolean)
  } else if (kind === "story_setup") {
    schemaName = "GenerateStoryResponse"
    zodSchema = buildStorySetupSchema(modules, moduleState, playerName, knownNpcNames, fieldSet)
    previewKeys = [
      playerName,
      "title",
      "opening_scenario",
      "starting_location",
      "starting_date",
      "starting_time",
      "general_description",
    ].filter(Boolean)
  } else if (kind === "character_generation") {
    schemaName = "GenerateCharacterResponse"
    zodSchema = z
      .object({
        ...buildCharacterFieldShape(
          ["name", "race", "gender", "general_description"],
          CharacterRole.Player,
          moduleState,
        ),
        ...buildCharacterFieldShape(
          ["baseline_appearance", "personality_traits", "major_flaws", "perks"],
          CharacterRole.Player,
          moduleState,
        ),
        ...(playerBaseCustom.length > 0
          ? {
              custom_fields: z
                .object(buildCustomFieldShape(playerBaseCustom, { optional: true }))
                .strict()
                .optional()
                .describe(getFieldDescription("state.character.custom_fields")),
            }
          : {}),
      })
      .strict()
    previewKeys = ["name", "race", "gender", "general_description", "baseline_appearance", "custom_fields"]
  } else {
    schemaName = "CharacterCreation"
    zodSchema = buildCharacterCreationSchema(
      fieldSet.npc.creation.map((field) => field.id as CharacterFieldId),
      CharacterRole.Npc,
      fieldSet.npc.customCreation,
      moduleState,
    )
    previewKeys = [
      "name",
      "race",
      "gender",
      "general_description",
      "baseline_appearance",
      "current_activity",
      "current_location",
    ]
  }

  return {
    kind,
    schemaName,
    zodSchema,
    previewKeys,
    builtInUpdateKeys: {
      player: [
        ...fieldSet.player.current.map((field) => field.id).filter((fieldId) => fieldId !== "memories"),
        ...(moduleState.character_memories ? ["new_memories"] : []),
      ],
      npc: [
        ...fieldSet.npc.current.map((field) => field.id).filter((fieldId) => fieldId !== "memories"),
        ...(moduleState.npc_memories ? ["new_memories"] : []),
      ],
    },
    promptHints: buildPromptHints(kind, modules, playerName, knownNpcNames, fieldSet),
    fieldSet,
  }
}

export function getCharacterPatch(value: unknown, name: string): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null
  const patch = (value as Record<string, unknown>)[name]
  if (!patch || typeof patch !== "object" || Array.isArray(patch)) return null
  return patch as Record<string, unknown>
}

export function extractCustomFieldPatch(
  patch: Record<string, unknown> | null,
  builtInKeys: readonly string[],
): Record<string, string | string[]> | undefined {
  if (!patch) return undefined
  const builtInKeySet = new Set(builtInKeys)
  const customFields: Record<string, string | string[]> = {}
  for (const [key, value] of Object.entries(patch)) {
    if (builtInKeySet.has(key)) continue
    if (typeof value === "string") customFields[key] = value
    if (Array.isArray(value) && value.every((entry) => typeof entry === "string")) {
      customFields[key] = value as string[]
    }
  }
  return Object.keys(customFields).length > 0 ? customFields : undefined
}
