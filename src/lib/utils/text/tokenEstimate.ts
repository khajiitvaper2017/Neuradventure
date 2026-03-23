import { countTokens } from "token-estimator"
import type { ChatCompletionMessageParam } from "@/llm/openai-types"

export function estimateTokens(text: string): number {
  const normalized = text.trim()
  if (!normalized) return 0
  return countTokens(normalized, {
    keepWhitespace: false,
    mode: "openai",
  })
}

export function estimateChatTokens(messages: ChatCompletionMessageParam[]): number {
  if (!Array.isArray(messages) || messages.length === 0) return 0
  return estimateTokens(
    messages
      .map((message) => (typeof message.content === "string" ? message.content.trim() : ""))
      .filter(Boolean)
      .join("\n\n"),
  )
}

export function formatTokenCount(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return "0"
  if (count >= 10_000) return `${Math.round(count / 1000)}k`
  if (count >= 1000) return `${(count / 1000).toFixed(1).replace(/\\.0$/, "")}k`
  return String(Math.round(count))
}
