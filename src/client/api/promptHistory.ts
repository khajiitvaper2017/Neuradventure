import { request } from "./http.js"

export type PromptHistoryKind = "story" | "character" | "chat"

export const promptHistory = {
  list: async (kind: PromptHistoryKind, limit?: number) => {
    const qs = typeof limit === "number" ? `?limit=${encodeURIComponent(String(limit))}` : ""
    const res = await request<{ items: string[] }>(`/api/prompt-history/${kind}${qs}`)
    return res.items
  },
  add: async (kind: PromptHistoryKind, prompt: string, limit?: number) => {
    const res = await request<{ items: string[] }>(`/api/prompt-history/${kind}`, {
      method: "POST",
      body: JSON.stringify({ prompt, ...(typeof limit === "number" ? { limit } : {}) }),
    })
    return res.items
  },
  bulkAdd: async (kind: PromptHistoryKind, prompts: string[], limit?: number) => {
    const res = await request<{ items: string[] }>(`/api/prompt-history/${kind}/bulk`, {
      method: "POST",
      body: JSON.stringify({ prompts, ...(typeof limit === "number" ? { limit } : {}) }),
    })
    return res.items
  },
  remove: async (kind: PromptHistoryKind, prompt: string, limit?: number) => {
    const res = await request<{ items: string[] }>(`/api/prompt-history/${kind}`, {
      method: "DELETE",
      body: JSON.stringify({ prompt, ...(typeof limit === "number" ? { limit } : {}) }),
    })
    return res.items
  },
}
