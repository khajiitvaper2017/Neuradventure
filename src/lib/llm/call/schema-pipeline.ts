import { z } from "zod"
import { derefJsonSchema, zodSchemaToJsonSchema } from "@/llm/schema/json-schema"

type MissingDescription = { path: string }

export function buildInjectedJsonSchema(
  schemaName: string,
  zodSchema: z.ZodTypeAny,
): {
  jsonSchema: object
  missing: MissingDescription[]
} {
  const schema = zodSchemaToJsonSchema(zodSchema, schemaName)
  return { jsonSchema: derefJsonSchema(schema), missing: [] }
}

export function warnOnMissingSchemaDescriptions(schemaName: string, missing: MissingDescription[]): void {
  if (missing.length === 0) return
  const sample = missing.slice(0, 12).map((m) => m.path)
  console.warn(
    `[llm-schema] Missing descriptions for ${schemaName}: ${missing.length} field(s). Examples: ${sample.join(", ")}`,
  )
}
