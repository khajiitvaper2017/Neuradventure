import { z } from "zod"
import { AppError } from "@/errors"
import * as db from "@/engine/core/db"
import { getCachedUpstreamModels } from "@/engine/llm/models"
import { getCtxLimitCached, initCtxLimit } from "@/engine/llm"
import type { AppSettings, ModelInfo, PromptConfigFile, SamplerPreset } from "@/shared/api-types"

const BuiltinPresetSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  params: z.record(z.string(), z.unknown()),
})

type BuiltinPreset = z.infer<typeof BuiltinPresetSchema>

const builtinPresetModules = import.meta.glob("/src/lib/shared/config/presets/*.json", { eager: true }) as Record<
  string,
  { default?: unknown } | unknown
>

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

function prettyJson(text: string): string {
  try {
    const parsed = JSON.parse(text) as unknown
    return JSON.stringify(parsed, null, 2)
  } catch {
    return text
  }
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
    ...(patch.theme !== undefined && { theme: patch.theme }),
    ...(patch.design !== undefined && { design: patch.design }),
    ...(patch.textJustify !== undefined && { textJustify: patch.textJustify }),
    ...(patch.colorScheme !== undefined && { colorScheme: patch.colorScheme }),
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
    const current = db.getSettings()
    return { ...current, ctx_limit_detected: getCtxLimitCached() }
  },

  update: async (data: Partial<AppSettings>): Promise<AppSettings> => {
    const current = db.getSettings()
    const next = mergeSettings(current, data)
    db.updateSettings(next)

    initCtxLimit().catch((err) => {
      console.warn("[ctx_limit] Failed to refresh context limit", err)
    })

    return { ...next, ctx_limit_detected: getCtxLimitCached() }
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

  promptConfigs: async (): Promise<PromptConfigFile[]> => {
    const rows = db.listPromptConfigFiles()
    return rows.map((r) => ({ ...r, config_json: prettyJson(r.config_json) }))
  },

  updatePromptConfig: async (name: PromptConfigFile["name"], config_json: string): Promise<PromptConfigFile> => {
    try {
      const row = db.updatePromptConfigFile(name, config_json)
      return { ...row, config_json: prettyJson(row.config_json) }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to update prompt config"
      throw new AppError(400, message)
    }
  },

  resetPromptConfig: async (name: PromptConfigFile["name"]): Promise<PromptConfigFile> => {
    try {
      const row = db.resetPromptConfigFile(name)
      return { ...row, config_json: prettyJson(row.config_json) }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset prompt config"
      throw new AppError(400, message)
    }
  },

  resetAllPromptConfigs: async (): Promise<{ ok: boolean; reset: number }> => {
    try {
      const reset = db.resetAllPromptConfigFiles()
      return { ok: true, reset }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to reset prompt configs"
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
}
