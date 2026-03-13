import { z } from "zod"

type JsonSchemaResponseFormat = {
  type: "json_schema"
  json_schema: { name: string; description?: string; schema: object; strict?: boolean }
}

export function zodSchemaToJsonSchema(schema: z.ZodType, name: string): object {
  const jsonSchema = z.toJSONSchema(schema, { target: "draft-07", io: "input" }) as Record<string, unknown>
  if (!jsonSchema.title) jsonSchema.title = name
  return jsonSchema as object
}

export function buildJsonSchemaResponseFormat(
  schemaName: string,
  schema: object,
  options: { strict?: boolean; description?: string } = {},
): JsonSchemaResponseFormat {
  return {
    type: "json_schema",
    json_schema: {
      name: schemaName,
      ...(options.description ? { description: options.description } : {}),
      schema: derefJsonSchema(schema),
      ...(options.strict ? { strict: true } : {}),
    },
  }
}

export function derefJsonSchema(schema: object): object {
  const root = schema as Record<string, unknown>
  const seen = new Map<string, unknown>()

  const resolvePointer = (pointer: string): unknown => {
    if (!pointer.startsWith("#/")) return undefined
    const parts = pointer
      .slice(2)
      .split("/")
      .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    let current: unknown = root
    for (const part of parts) {
      if (!current || typeof current !== "object") return undefined
      const obj = current as Record<string, unknown>
      if (!(part in obj)) return undefined
      current = obj[part]
    }
    return current
  }

  const derefNode = (node: unknown, path: string): unknown => {
    if (Array.isArray(node)) return node.map((item, index) => derefNode(item, `${path}/${index}`))
    if (!node || typeof node !== "object") return node

    const obj = node as Record<string, unknown>
    const ref = obj.$ref
    if (typeof ref === "string") {
      const cached = seen.get(ref)
      if (cached) return cached
      const target = resolvePointer(ref)
      if (target) {
        const resolved = derefNode(target, ref)
        seen.set(ref, resolved)
        return resolved
      }
    }

    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(obj)) {
      if (k === "$ref" || k === "definitions" || k === "$defs") continue
      out[k] = derefNode(v, `${path}/${k}`)
    }
    return out
  }

  const resolved = derefNode(root, "#")
  if (resolved && typeof resolved === "object" && root.$schema && !(resolved as Record<string, unknown>).$schema) {
    ;(resolved as Record<string, unknown>).$schema = root.$schema
  }
  return (resolved ?? schema) as object
}
