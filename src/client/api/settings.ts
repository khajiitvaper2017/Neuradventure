import { request } from "./http.js"
import type { AppSettings, ModelInfo, PromptConfigFile, SamplerPreset } from "./types.js"

export const settings = {
  get: () => request<AppSettings>("/api/settings"),
  update: (data: Partial<AppSettings>) =>
    request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
  models: (q?: string, limit?: number) => {
    const params = new URLSearchParams()
    if (q && q.trim()) params.set("q", q.trim())
    if (typeof limit === "number" && Number.isFinite(limit)) params.set("limit", String(Math.floor(limit)))
    const qs = params.toString()
    return request<{ models: ModelInfo[] }>(`/api/settings/models${qs ? `?${qs}` : ""}`)
  },
  promptConfigs: () => request<PromptConfigFile[]>("/api/settings/prompts"),
  updatePromptConfig: (name: PromptConfigFile["name"], config_json: string) =>
    request<PromptConfigFile>(`/api/settings/prompts/${name}`, {
      method: "PUT",
      body: JSON.stringify({ config_json }),
    }),
  resetPromptConfig: (name: PromptConfigFile["name"]) =>
    request<PromptConfigFile>(`/api/settings/prompts/${name}/reset`, { method: "POST" }),
  resetAllPromptConfigs: () =>
    request<{ ok: boolean; reset: number }>("/api/settings/prompts/reset", { method: "POST" }),
  presets: () => request<SamplerPreset[]>("/api/settings/presets"),
  upsertPreset: (preset: Omit<SamplerPreset, "id">) =>
    request<SamplerPreset>("/api/settings/presets", { method: "POST", body: JSON.stringify(preset) }),
  deletePreset: (id: number) => request<{ ok: boolean }>(`/api/settings/presets/${id}`, { method: "DELETE" }),
}
