import { request } from "./http.js"
import type { AppSettings, SamplerPreset } from "./types.js"

export const settings = {
  get: () => request<AppSettings>("/api/settings"),
  update: (data: Partial<AppSettings>) =>
    request<AppSettings>("/api/settings", { method: "PUT", body: JSON.stringify(data) }),
  presets: () => request<SamplerPreset[]>("/api/settings/presets"),
}
