export type CustomFieldModuleTarget = "character" | "npc"

export type CustomFieldModuleEntry = Partial<Record<CustomFieldModuleTarget, boolean>>

export type HasCustomFieldModules = {
  custom_field_modules?: Record<string, CustomFieldModuleEntry> | undefined
}

export function isCustomFieldModuleEnabled(
  modules: HasCustomFieldModules | undefined,
  fieldId: string,
  target: CustomFieldModuleTarget,
): boolean {
  const id = String(fieldId ?? "").trim()
  if (!id) return true
  const raw = modules?.custom_field_modules?.[id]?.[target]
  return typeof raw === "boolean" ? raw : true
}

