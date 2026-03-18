import { z } from "zod"
import {
  TurnResponseSchema,
  WorldStateUpdateSchema,
  type StoryModules,
  type NPCState,
  type TurnResponse,
  buildTurnCharacterUpdateSchema,
} from "@/types/models"
import { buildNpcCreationSchema } from "@/domain/story/schemas/npc-creation"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "@/domain/story/schemas/story-modules"
import * as db from "@/db/core"
import {
  buildCharacterCustomFieldShape,
  buildWorldCustomFieldsUpdateSchema,
} from "@/domain/story/schemas/custom-fields"
import { isCustomFieldModuleEnabled } from "@/domain/story/custom-field-modules"

const DEFAULT_MODULES: StoryModules = { ...DEFAULT_STORY_MODULES }

export function buildTurnResponseSchema(
  playerName: string,
  knownNpcs: NPCState[],
  modules: StoryModules = DEFAULT_MODULES,
): z.ZodType<TurnResponse, unknown> {
  const uniqueNames = Array.from(new Set(knownNpcs.map((npc) => npc.name.trim()).filter((name) => name.length > 0)))
  const trimmedPlayerName = playerName.trim()
  const flags = resolveModuleFlags(modules)
  const customFieldDefs = db.listCustomFields().filter((d) => d.enabled)
  const characterDefs = customFieldDefs.filter((d) => d.scope === "character")
  const playerCharacterDefs = characterDefs.filter((d) => isCustomFieldModuleEnabled(modules, d.id, "character"))
  const npcCharacterDefs = characterDefs.filter((d) => isCustomFieldModuleEnabled(modules, d.id, "npc"))
  const playerCustomFieldShape = buildCharacterCustomFieldShape(playerCharacterDefs)
  const npcCustomFieldShape = buildCharacterCustomFieldShape(npcCharacterDefs)
  const worldCustomFields = buildWorldCustomFieldsUpdateSchema(customFieldDefs)
  const npcCreationSchema = buildNpcCreationSchema(
    {
      useNpcAppearance: flags.useNpcAppearance,
      useNpcPersonalityTraits: flags.useNpcPersonalityTraits,
      useNpcMajorFlaws: flags.useNpcMajorFlaws,
      useNpcPerks: flags.useNpcPerks,
      useNpcLocation: flags.useNpcLocation,
      useNpcActivity: flags.useNpcActivity,
    },
    Object.keys(npcCustomFieldShape).length > 0 ? z.object(npcCustomFieldShape).strict() : undefined,
  )

  let schema: z.ZodObject = TurnResponseSchema

  schema = schema.extend({
    world_state_update: WorldStateUpdateSchema.extend({ custom_fields: worldCustomFields.optional() }),
  })

  if (modules.track_npcs) {
    schema = schema.extend({
      npc_introductions: z.array(npcCreationSchema).optional(),
    })
  }

  if (!modules.track_background_events) {
    schema = schema.omit({ background_events: true })
  }

  const playerUpdateSchema = buildTurnCharacterUpdateSchema(
    {
      allowRace: false,
      allowGender: false,
      allowLocation: flags.useCharLocation,
      allowAppearance: flags.useCharAppearance,
      allowClothing: flags.useCharAppearance,
      allowActivity: flags.useCharActivity,
      allowInventory: flags.useCharInventory,
    },
    playerCustomFieldShape,
  )
  const npcUpdateSchema = buildTurnCharacterUpdateSchema(
    {
      allowRace: true,
      allowGender: true,
      allowLocation: flags.useNpcLocation,
      allowAppearance: flags.useNpcAppearance,
      allowClothing: flags.useNpcAppearance,
      allowActivity: flags.useNpcActivity,
      allowInventory: flags.useNpcInventory,
    },
    npcCustomFieldShape,
  )

  const dynamicCharacterShape: Record<string, z.ZodTypeAny> = {}
  if (trimmedPlayerName) {
    dynamicCharacterShape[trimmedPlayerName] = playerUpdateSchema
      .optional()
      .describe(`Optional changed fields for ${trimmedPlayerName}. Use the exact character name as the key.`)
  }
  if (modules.track_npcs) {
    const seen = new Set(trimmedPlayerName ? [trimmedPlayerName.toLowerCase()] : [])
    for (const npcName of uniqueNames) {
      const key = npcName.trim()
      if (!key || seen.has(key.toLowerCase())) continue
      seen.add(key.toLowerCase())
      dynamicCharacterShape[key] = npcUpdateSchema
        .optional()
        .describe(`Optional changed fields for tracked character ${key}. Use the exact character name as the key.`)
    }
  }
  if (Object.keys(dynamicCharacterShape).length > 0) {
    schema = schema.extend(dynamicCharacterShape)
  }

  return schema as unknown as z.ZodType<TurnResponse, unknown>
}
