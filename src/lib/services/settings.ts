import { z } from "zod"
import { AppError } from "@/errors"
import * as db from "@/db/core"
import { getCachedUpstreamModels } from "@/llm/models"
import { getCtxLimitCached, initCtxLimit } from "@/llm"
import type { AppSettings, CustomFieldDef, ModelInfo, PromptTemplateFile, SamplerPreset } from "@/types/api"
import { HIDDEN_SECRET_PLACEHOLDER } from "@/secrets"
import {
  areConnectorSecretsReady,
  clearConnectorApiKey,
  getCachedConnectorApiKey,
  hasCachedConnectorApiKey,
  initConnectorApiKeySecrets,
  setConnectorApiKey,
} from "@/secrets/connector-api-keys"

const BuiltinPresetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  params: z.record(z.string(), z.unknown()),
})

type BuiltinPreset = z.infer<typeof BuiltinPresetSchema>

const builtinPresetModules = import.meta.glob("/src/lib/config/presets/*.json", { eager: true }) as Record<
  string,
  { default?: unknown } | unknown
>

const CustomFieldSchema = z.object({
  id: z
    .string()
    .trim()
    .min(1)
    .max(64)
    .regex(/^[a-z][a-z0-9_]*$/, "id must be a lowercase slug (a-z0-9_)"),
  scope: z.enum(["character", "world"]),
  value_type: z.enum(["text", "list"]),
  label: z.string().trim().min(1).max(120),
  placement: z.enum(["base", "current", "context", "memory"]),
  prompt: z.string().optional().default(""),
  enabled: z.boolean().optional().default(true),
  sort_order: z.number().int().optional().default(0),
})

function validatePlacement(scope: CustomFieldDef["scope"], placement: CustomFieldDef["placement"]): void {
  if (scope === "character" && placement !== "base" && placement !== "current") {
    throw new AppError(400, "Character custom fields must use placement: base or current")
  }
  if (scope === "world" && placement !== "context" && placement !== "memory") {
    throw new AppError(400, "World custom fields must use placement: context or memory")
  }
}

function readBuiltinPresets(): BuiltinPreset[] {
  const entries = Object.entries(builtinPresetModules).sort(([a], [b]) => a.localeCompare(b))
  const out: BuiltinPreset[] = []
  for (const [path, mod] of entries) {
    const raw =
      mod && typeof mod === "object" && "default" in (mod as Record<string, unknown>)
        ? (mod as { default: unknown }).default
        : mod
    const parsed = BuiltinPresetSchema.safeParse(raw)
    if (parsed.success) out.push(parsed.data)
    else console.warn(`[presets] Skipping invalid builtin preset: ${path}`)
  }
  return out
}

function mergeConnectorApiKeys(
  base: AppSettings["connector"]["api_keys"],
  patch?: Partial<AppSettings["connector"]["api_keys"]>,
): AppSettings["connector"]["api_keys"] {
  return {
    koboldcpp: patch?.koboldcpp ?? base.koboldcpp,
    openrouter: patch?.openrouter ?? base.openrouter,
  }
}

function mergeSettings(current: AppSettings, patch: Partial<AppSettings>): AppSettings {
  const nextConnectorRaw = patch.connector
    ? ({
        ...current.connector,
        ...patch.connector,
        api_keys: mergeConnectorApiKeys(current.connector.api_keys, patch.connector.api_keys),
      } as AppSettings["connector"])
    : current.connector

  const next: AppSettings = {
    ...current,
    ...(patch.colorMode !== undefined && { colorMode: patch.colorMode }),
    ...(patch.streamingEnabled !== undefined && { streamingEnabled: patch.streamingEnabled }),
    ...(patch.sectionFormat !== undefined && { sectionFormat: patch.sectionFormat }),
    ...(patch.timeouts ? { timeouts: { ...current.timeouts, ...patch.timeouts } } : {}),
    ...(patch.authorNoteEnabled !== undefined && { authorNoteEnabled: patch.authorNoteEnabled }),
    ...(patch.defaultAuthorNote !== undefined && { defaultAuthorNote: patch.defaultAuthorNote }),
    ...(patch.defaultAuthorNoteDepth !== undefined && { defaultAuthorNoteDepth: patch.defaultAuthorNoteDepth }),
    ...(patch.defaultAuthorNotePosition !== undefined && {
      defaultAuthorNotePosition: patch.defaultAuthorNotePosition,
    }),
    ...(patch.defaultAuthorNoteInterval !== undefined && {
      defaultAuthorNoteInterval: patch.defaultAuthorNoteInterval,
    }),
    ...(patch.defaultAuthorNoteRole !== undefined && { defaultAuthorNoteRole: patch.defaultAuthorNoteRole }),
    ...(patch.defaultAuthorNoteEmbedState !== undefined && {
      defaultAuthorNoteEmbedState: patch.defaultAuthorNoteEmbedState,
    }),
    ...(patch.storyDefaults ? { storyDefaults: { ...current.storyDefaults, ...patch.storyDefaults } } : {}),
    connector: nextConnectorRaw,
    ...(patch.generation ? { generation: { ...current.generation, ...patch.generation } } : {}),
  }

  if (next.connector.type === "openrouter") {
    const model = (next.connector.model ?? "").trim()
    if (!model) {
      next.connector = {
        ...next.connector,
        model: current.connector.type === "openrouter" ? current.connector.model : "openrouter/auto",
      }
    }
  }

  const url = next.connector.url?.trim()
  if (!url) {
    next.connector = current.connector
  } else {
    next.connector = { ...next.connector, url }
  }

  return next
}

export const settings = {
  get: async (): Promise<AppSettings> => {
    await initConnectorApiKeySecrets()
    const current = db.getSettings()
    const out = { ...current, ctx_limit_detected: getCtxLimitCached() }
    return areConnectorSecretsReady() ? redactSecrets(out) : out
  },

  update: async (data: Partial<AppSettings>): Promise<AppSettings> => {
    await initConnectorApiKeySecrets()
    const scrubbedPatch = areConnectorSecretsReady() ? await applySecretPatch(data) : data
    const current = db.getSettings()
    const next = mergeSettings(current, scrubbedPatch)
    db.updateSettings(next)

    initCtxLimit().catch((err) => {
      console.warn("[ctx_limit] Failed to refresh context limit", err)
    })

    const out = { ...next, ctx_limit_detected: getCtxLimitCached() }
    return areConnectorSecretsReady() ? redactSecrets(out) : out
  },

  models: async (q?: string, limit?: number): Promise<{ models: ModelInfo[] }> => {
    const connector = db.getSettings().connector
    const models = await getCachedUpstreamModels(connector)
    const query = (q ?? "").trim().toLowerCase()
    const max =
      typeof limit === "number" && Number.isFinite(limit) ? Math.max(1, Math.min(250, Math.trunc(limit))) : 100
    const filtered = query
      ? models.filter((m) => {
          const hay = `${m.id} ${m.name ?? ""}`.toLowerCase()
          return hay.includes(query)
        })
      : models
    return { models: filtered.slice(0, max) }
  },

  promptTemplates: async (): Promise<PromptTemplateFile[]> => {
    const rows = db.listPromptTemplateFiles()
    return rows.map((r) => ({ ...r }))
  },

  updatePromptTemplate: async (
    name: PromptTemplateFile["name"],
    template_text: string,
  ): Promise<PromptTemplateFile> => {
    try {
      const row = db.updatePromptTemplateFile(name, template_text)
      return { ...row }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update prompt template"
      throw new AppError(400, message)
    }
  },

  resetPromptTemplate: async (name: PromptTemplateFile["name"]): Promise<PromptTemplateFile> => {
    try {
      const row = db.resetPromptTemplateFile(name)
      return { ...row }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset prompt template"
      throw new AppError(400, message)
    }
  },

  resetAllPromptTemplates: async (): Promise<{ ok: boolean; reset: number }> => {
    try {
      const reset = db.resetAllPromptTemplateFiles()
      return { ok: true, reset }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset prompt templates"
      throw new AppError(400, message)
    }
  },

  customFields: async (): Promise<CustomFieldDef[]> => {
    return db.listCustomFields()
  },

  upsertCustomField: async (def: Omit<CustomFieldDef, "created_at" | "updated_at">): Promise<CustomFieldDef> => {
    const parsed = CustomFieldSchema.parse(def) as Omit<CustomFieldDef, "created_at" | "updated_at">
    validatePlacement(parsed.scope, parsed.placement)

    const existing = db.listCustomFields()
    const isNew = !existing.some((f) => f.id === parsed.id)
    if (isNew) {
      const scopeCount = existing.filter((f) => f.scope === parsed.scope).length
      if (scopeCount >= 40) throw new AppError(400, "Too many custom fields for this scope (max 40).")
    }

    try {
      return db.upsertCustomField(parsed)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save custom field"
      throw new AppError(400, message)
    }
  },

  deleteCustomField: async (id: string): Promise<{ ok: boolean }> => {
    try {
      const ok = db.deleteCustomField(id)
      if (!ok) throw new AppError(404, "Custom field not found")
      return { ok: true }
    } catch (err) {
      if (err instanceof AppError) throw err
      const message = err instanceof Error ? err.message : "Failed to delete custom field"
      throw new AppError(400, message)
    }
  },

  fieldPromptOverrides: async (): Promise<Record<string, string>> => {
    return db.getFieldPromptOverridesRow().overrides
  },

  setFieldPromptOverride: async (key: string, value: string): Promise<Record<string, string>> => {
    try {
      return db.setFieldPromptOverride(key, value)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update field prompt override"
      throw new AppError(400, message)
    }
  },

  resetFieldPromptOverride: async (key: string): Promise<Record<string, string>> => {
    try {
      return db.resetFieldPromptOverride(key)
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset field prompt override"
      throw new AppError(400, message)
    }
  },

  resetAllFieldPromptOverrides: async (): Promise<{ ok: boolean }> => {
    try {
      db.resetAllFieldPromptOverrides()
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset field prompt overrides"
      throw new AppError(400, message)
    }
  },

  presets: async (): Promise<SamplerPreset[]> => {
    const builtins = readBuiltinPresets().map((p) => ({
      name: p.name,
      description: p.description ?? "",
      params: p.params as unknown as SamplerPreset["params"],
    }))

    const custom = db.listSamplerPresets()

    const merged: SamplerPreset[] = [...builtins]
    for (const p of custom) {
      const idx = merged.findIndex((x) => x.name === p.name)
      if (idx >= 0) merged[idx] = p
      else merged.push(p)
    }

    return merged
  },

  upsertPreset: async (preset: Omit<SamplerPreset, "id">): Promise<SamplerPreset> => {
    if (!preset.name.trim()) throw new AppError(400, "Preset name is required")
    return db.upsertSamplerPreset({
      name: preset.name.trim(),
      description: preset.description ?? "",
      params: preset.params,
    })
  },

  deletePreset: async (id: number): Promise<{ ok: boolean }> => {
    const parsed = Number(id)
    if (!Number.isFinite(parsed) || !Number.isInteger(parsed) || parsed <= 0)
      throw new AppError(400, "Invalid preset id")
    const ok = db.deleteSamplerPreset(parsed)
    if (!ok) throw new AppError(404, "Preset not found")
    return { ok: true }
  },

  deleteAllCustomFields: async (): Promise<{ ok: boolean; deleted: number }> => {
    try {
      const deleted = db.deleteAllCustomFields()
      return { ok: true, deleted }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete custom fields"
      throw new AppError(400, message)
    }
  },

  deleteAllSamplerPresets: async (): Promise<{ ok: boolean; deleted: number }> => {
    try {
      const deleted = db.deleteAllSamplerPresets()
      return { ok: true, deleted }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to delete sampler presets"
      throw new AppError(400, message)
    }
  },

  clearAllPromptHistory: async (): Promise<{ ok: boolean; deleted: number }> => {
    try {
      const deleted = db.clearAllPromptHistory()
      return { ok: true, deleted }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to clear prompt history"
      throw new AppError(400, message)
    }
  },

  resetSettingsToDefaults: async (): Promise<{ ok: boolean }> => {
    try {
      db.updateSettings(db.DEFAULT_SETTINGS)
      initCtxLimit().catch((err) => {
        console.warn("[ctx_limit] Failed to refresh context limit", err)
      })
      return { ok: true }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset settings"
      throw new AppError(400, message)
    }
  },

  resetConnectorApiKeys: async (): Promise<{ ok: boolean; cleared_openrouter_key: boolean }> => {
    let cleared_openrouter_key = false
    try {
      await initConnectorApiKeySecrets()
      if (!areConnectorSecretsReady()) throw new Error("Secret storage unavailable")
      await Promise.allSettled([setConnectorApiKey("koboldcpp", "kobold"), clearConnectorApiKey("openrouter")])
      cleared_openrouter_key = true
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset connector API keys"
      throw new AppError(400, message)
    }
    return { ok: true, cleared_openrouter_key }
  },

  resetAllConfig: async (): Promise<{
    ok: boolean
    reset_prompt_templates: number
    cleared_field_prompt_overrides: boolean
    deleted_custom_fields: number
    deleted_sampler_presets: number
    deleted_prompt_history: number
    reset_settings: boolean
    cleared_openrouter_key: boolean
  }> => {
    const reset_prompt_templates = db.resetAllPromptTemplateFiles()
    db.resetAllFieldPromptOverrides()
    const deleted_custom_fields = db.deleteAllCustomFields()
    const deleted_sampler_presets = db.deleteAllSamplerPresets()
    const deleted_prompt_history = db.clearAllPromptHistory()
    db.updateSettings(db.DEFAULT_SETTINGS)

    let cleared_openrouter_key = false
    try {
      await initConnectorApiKeySecrets()
      if (areConnectorSecretsReady()) {
        await Promise.allSettled([setConnectorApiKey("koboldcpp", "kobold"), clearConnectorApiKey("openrouter")])
        cleared_openrouter_key = true
      }
    } catch {
      // Ignore secret-store failures.
    }

    initCtxLimit().catch((err) => {
      console.warn("[ctx_limit] Failed to refresh context limit", err)
    })

    return {
      ok: true,
      reset_prompt_templates,
      cleared_field_prompt_overrides: true,
      deleted_custom_fields,
      deleted_sampler_presets,
      deleted_prompt_history,
      reset_settings: true,
      cleared_openrouter_key,
    }
  },
}

function redactSecrets(settings: AppSettings): AppSettings {
  const out: AppSettings = { ...settings }
  const apiKeys = out.connector.api_keys
  const kobold = getCachedConnectorApiKey("koboldcpp")
  out.connector = {
    ...out.connector,
    api_keys: {
      ...apiKeys,
      koboldcpp: hasCachedConnectorApiKey("koboldcpp") ? (kobold ? HIDDEN_SECRET_PLACEHOLDER : "") : "",
      openrouter: hasCachedConnectorApiKey("openrouter") ? HIDDEN_SECRET_PLACEHOLDER : "",
    },
  }
  return out
}

async function applySecretPatch(patch: Partial<AppSettings>): Promise<Partial<AppSettings>> {
  const apiKeys = patch.connector?.api_keys
  if (!apiKeys) return patch

  const updates: Array<Promise<void>> = []
  const maybeSet = (type: "koboldcpp" | "openrouter", raw: unknown) => {
    if (typeof raw !== "string") return
    const trimmed = raw.trim()
    if (trimmed === HIDDEN_SECRET_PLACEHOLDER) return
    if (!trimmed) {
      if (type === "koboldcpp") updates.push(setConnectorApiKey(type, ""))
      else updates.push(clearConnectorApiKey(type))
      return
    }
    updates.push(setConnectorApiKey(type, trimmed))
  }

  maybeSet("koboldcpp", apiKeys.koboldcpp)
  maybeSet("openrouter", apiKeys.openrouter)

  if (updates.length > 0) await Promise.all(updates)

  const nextConnector = patch.connector ? { ...patch.connector } : undefined
  if (nextConnector) delete (nextConnector as Partial<AppSettings["connector"]>).api_keys

  return nextConnector ? { ...patch, connector: nextConnector } : patch
}
