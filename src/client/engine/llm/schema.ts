import { z } from "zod"
import {
  buildNPCStateUpdateSchema,
  buildNPCChangesSection,
  TurnResponseSchema,
  WorldStateUpdateSchema,
  type StoryModules,
  type NPCState,
  type TurnResponse,
} from "../core/models.js"
import { buildNpcCreationSchema } from "../schemas/npc-creation.js"
import { DEFAULT_STORY_MODULES, resolveModuleFlags } from "../schemas/story-modules.js"

const DEFAULT_MODULES: StoryModules = { ...DEFAULT_STORY_MODULES }

export function buildTurnResponseSchema(
  knownNpcs: NPCState[],
  modules: StoryModules = DEFAULT_MODULES,
): z.ZodType<TurnResponse, unknown> {
  const uniqueNames = Array.from(new Set(knownNpcs.map((npc) => npc.name.trim()).filter((name) => name.length > 0)))
  const flags = resolveModuleFlags(modules)
  const npcCreationSchema = buildNpcCreationSchema({
    useNpcAppearance: flags.useNpcAppearance,
    useNpcPersonalityTraits: flags.useNpcPersonalityTraits,
    useNpcMajorFlaws: flags.useNpcMajorFlaws,
    useNpcQuirks: flags.useNpcQuirks,
    useNpcPerks: flags.useNpcPerks,
    useNpcLocation: flags.useNpcLocation,
    useNpcActivity: flags.useNpcActivity,
  })

  let schema: z.ZodObject = TurnResponseSchema

  const worldUpdateSchema: z.ZodObject = modules.track_locations
    ? WorldStateUpdateSchema
    : WorldStateUpdateSchema.omit({ locations: true })

  schema = schema.extend({
    world_state_update: worldUpdateSchema,
  })

  if (!modules.track_npcs) {
    const emptyUpdates = buildNPCStateUpdateSchema(z.string().min(1), {
      allowLocation: flags.useNpcLocation,
      allowAppearance: flags.useNpcAppearance,
      allowClothing: flags.useNpcAppearance,
      allowActivity: flags.useNpcActivity,
    })
    schema = schema.extend({
      npc_changes: z.array(emptyUpdates).max(0).optional(),
      npc_introductions: z.array(npcCreationSchema).max(0).optional(),
    })
  } else if (uniqueNames.length === 0) {
    const emptyUpdates = buildNPCStateUpdateSchema(z.string().min(1), {
      allowLocation: flags.useNpcLocation,
      allowAppearance: flags.useNpcAppearance,
      allowClothing: flags.useNpcAppearance,
      allowActivity: flags.useNpcActivity,
    })
    schema = schema.extend({
      npc_changes: z.array(emptyUpdates).max(0).optional(),
    })
  } else {
    const enumValues = uniqueNames as [string, ...string[]]
    const npcChangesSchema = buildNPCChangesSection(z.enum(enumValues), {
      allowLocation: flags.useNpcLocation,
      allowAppearance: flags.useNpcAppearance,
      allowClothing: flags.useNpcAppearance,
      allowActivity: flags.useNpcActivity,
    })
    schema = schema.extend({
      npc_changes: npcChangesSchema.optional(),
    })
  }

  if (modules.track_npcs) {
    schema = schema.extend({
      npc_introductions: z.array(npcCreationSchema).optional(),
    })
  }

  if (!flags.useCharAppearance) {
    schema = schema.omit({ current_appearance: true, current_clothing: true })
  }

  if (!flags.useCharInventory) {
    schema = schema.omit({ current_inventory: true })
  }

  if (!modules.track_background_events) {
    schema = schema.omit({ background_events: true })
  }

  return schema as unknown as z.ZodType<TurnResponse, unknown>
}
