import { z } from "zod"
import {
  buildNPCStateUpdateSchema,
  buildNPCChangesSection,
  TurnResponseSchema,
  WorldStateUpdateSchema,
  LocationSchema,
  NPCCreationSchema,
  type StoryModules,
  type NPCState,
  type TurnResponse,
} from "../core/models.js"
import { desc } from "../schemas/field-descriptions.js"

const DEFAULT_MODULES: StoryModules = {
  track_npcs: true,
  track_locations: true,
  character_detail_mode: "detailed",
}

export function buildTurnResponseSchema(
  knownNpcs: NPCState[],
  modules: StoryModules = DEFAULT_MODULES,
): z.ZodType<TurnResponse, z.ZodTypeDef, unknown> {
  const uniqueNames = Array.from(new Set(knownNpcs.map((npc) => npc.name.trim()).filter((name) => name.length > 0)))

  let schema: z.AnyZodObject = TurnResponseSchema

  if (!modules.track_npcs) {
    const emptyUpdates = buildNPCStateUpdateSchema(z.string().min(1).describe(desc("llm.npc_update.name")))
    schema = schema.extend({
      npc_changes: z.array(emptyUpdates).max(0).optional(),
      npc_introductions: z.array(NPCCreationSchema).max(0).optional(),
    })
  } else if (uniqueNames.length === 0) {
    const emptyUpdates = buildNPCStateUpdateSchema(z.string().min(1).describe(desc("llm.npc_update.name")))
    schema = schema.extend({
      npc_changes: z.array(emptyUpdates).max(0).optional(),
    })
  } else {
    const enumValues = uniqueNames as [string, ...string[]]
    const npcChangesSchema = buildNPCChangesSection(z.enum(enumValues).describe(desc("llm.npc_update.name")))
    schema = schema.extend({
      npc_changes: npcChangesSchema.optional(),
    })
  }

  if (!modules.track_locations) {
    schema = schema.extend({
      world_state_update: WorldStateUpdateSchema.extend({
        locations: z.array(LocationSchema).max(0).optional(),
      }).describe(desc("llm.turn_response.world_state_update")),
    })
  }

  return schema as unknown as z.ZodType<TurnResponse, z.ZodTypeDef, unknown>
}
