import { z } from "zod"
import { parseJsonFromContent } from "@/llm/io/parse"

function repairTurnResponseShape(value: unknown): unknown {
  if (!value || typeof value !== "object") return value
  const root = value as Record<string, unknown>

  // Remove invalid fields at root level that LLMs sometimes hallucinate
  delete root.location
  delete root.inventory_changes
  delete root.flags
  delete root.environment_changes

  // Fix common field name mismatches
  if (root.backgroundEvents !== undefined && root.background_events === undefined) {
    root.background_events = root.backgroundEvents
    delete root.backgroundEvents
  }
  if (root.background_event !== undefined && root.background_events === undefined) {
    root.background_events = root.background_event
    delete root.background_event
  }

  const wsu = root.world_state_update
  if (!wsu || typeof wsu !== "object") {
    root.world_state_update = {}
  } else {
    const wsuObj = wsu as Record<string, unknown>

    // Move npc_changes and npc_introductions from world_state_update to root
    if (wsuObj.npc_changes !== undefined && root.npc_changes === undefined) {
      root.npc_changes = wsuObj.npc_changes
      delete wsuObj.npc_changes
    }
    if (wsuObj.npc_introductions !== undefined && root.npc_introductions === undefined) {
      root.npc_introductions = wsuObj.npc_introductions
      delete wsuObj.npc_introductions
    }
    if (wsuObj.background_events !== undefined && root.background_events === undefined) {
      root.background_events = wsuObj.background_events
      delete wsuObj.background_events
    }

    // Fix common field name mismatches
    if (wsuObj.location !== undefined && wsuObj.current_scene === undefined) {
      wsuObj.current_scene = wsuObj.location
      delete wsuObj.location
    }
    if (wsuObj.time !== undefined && wsuObj.time_of_day === undefined) {
      wsuObj.time_of_day = wsuObj.time
      delete wsuObj.time
    }

    // Remove invalid fields that LLMs sometimes hallucinate
    delete wsuObj.environment_changes
    delete wsuObj.inventory_changes
    delete wsuObj.flags
  }

  return root
}

function formatZodIssues(error: z.ZodError): string {
  const issues = error.issues.map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)"
    return `${path}: ${issue.message}`
  })
  return issues.join("; ")
}

export function parseAndValidateJson<TSchema extends z.ZodTypeAny>(args: {
  schemaName: string
  zodSchema: TSchema
  responseContent: string
}): { parsed: z.infer<TSchema>; parsedCandidate: unknown } {
  const parsedRaw = parseJsonFromContent(args.responseContent, args.schemaName)
  const parsedCandidate = args.schemaName === "TurnResponse" ? repairTurnResponseShape(parsedRaw) : parsedRaw
  const validated = args.zodSchema.safeParse(parsedCandidate)
  if (!validated.success) {
    const issues = formatZodIssues(validated.error)
    throw new Error(`LLM returned JSON that failed validation for ${args.schemaName}: ${issues}`)
  }
  return { parsed: validated.data, parsedCandidate }
}
