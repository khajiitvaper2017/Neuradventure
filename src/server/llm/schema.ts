import { z } from "zod"
import {
  buildNPCStateUpdateSchema,
  buildNPCChangesSection,
  TurnResponseSchema,
  type NPCState,
  type TurnResponse,
} from "../models.js"
import { desc } from "../schemas/field-descriptions.js"

export function buildTurnResponseSchema(knownNpcs: NPCState[]): z.ZodType<TurnResponse, z.ZodTypeDef, unknown> {
  const uniqueNames = Array.from(new Set(knownNpcs.map((npc) => npc.name.trim()).filter((name) => name.length > 0)))

  if (uniqueNames.length === 0) {
    const emptyUpdates = buildNPCStateUpdateSchema(z.string().min(1).describe(desc("llm.npc_update.name")))
    return TurnResponseSchema.extend({
      npc_changes: z.array(emptyUpdates).max(0).optional(),
    })
  }

  const enumValues = uniqueNames as [string, ...string[]]
  const npcChangesSchema = buildNPCChangesSection(z.enum(enumValues).describe(desc("llm.npc_update.name")))

  return TurnResponseSchema.extend({
    npc_changes: npcChangesSchema.optional(),
  })
}
