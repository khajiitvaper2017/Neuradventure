import { z } from "zod"
import type { CustomFieldDef } from "@/types/api"

function isEnabledForScope(def: CustomFieldDef, scope: CustomFieldDef["scope"]): boolean {
  return def.scope === scope && def.enabled === true
}

export function buildCharacterCustomFieldsUpdateSchema(defs: CustomFieldDef[]): z.ZodObject {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const def of defs) {
    if (!isEnabledForScope(def, "character")) continue
    const id = def.id.trim()
    if (!id) continue
    const placeholder = `{state.character.custom_fields.${id}}`
    shape[id] =
      def.value_type === "list"
        ? z.array(z.string().min(1)).min(1).optional().describe(placeholder)
        : z.string().min(1).optional().describe(placeholder)
  }
  return z.object(shape).strict()
}

export function buildWorldCustomFieldsUpdateSchema(defs: CustomFieldDef[]): z.ZodObject {
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const def of defs) {
    if (!isEnabledForScope(def, "world")) continue
    const id = def.id.trim()
    if (!id) continue
    const placeholder = `{llm.world_state_update.custom_fields.${id}}`
    shape[id] =
      def.value_type === "list"
        ? z.array(z.string().min(1)).min(1).optional().describe(placeholder)
        : z.string().min(1).optional().describe(placeholder)
  }
  return z.object(shape).strict()
}
