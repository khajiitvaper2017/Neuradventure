import { promptHistory, type PromptHistoryKind } from "@/services/promptHistory"

const MAX_HISTORY = 12

function normalizePrompt(prompt: string): string {
  return prompt.trim()
}

function kindFromKey(key: string): PromptHistoryKind | null {
  const parts = key.split(":")
  const last = parts[parts.length - 1]?.trim()
  if (last === "story" || last === "character" || last === "chat") return last
  return null
}

export async function loadPromptHistory(key: string, max = MAX_HISTORY): Promise<string[]> {
  const kind = kindFromKey(key)
  if (!kind) return []
  try {
    return await promptHistory.list(kind, max)
  } catch {
    return []
  }
}

export async function savePromptHistory(key: string, prompt: string, max = MAX_HISTORY): Promise<string[]> {
  const kind = kindFromKey(key)
  if (!kind) return []
  const normalized = normalizePrompt(prompt)
  if (!normalized) return loadPromptHistory(key, max)
  try {
    return await promptHistory.add(kind, normalized, max)
  } catch {
    return loadPromptHistory(key, max)
  }
}

export async function removePromptHistory(key: string, prompt: string, max = MAX_HISTORY): Promise<string[]> {
  const kind = kindFromKey(key)
  if (!kind) return []
  const normalized = normalizePrompt(prompt)
  if (!normalized) return loadPromptHistory(key, max)
  try {
    return await promptHistory.remove(kind, normalized, max)
  } catch {
    return loadPromptHistory(key, max)
  }
}
