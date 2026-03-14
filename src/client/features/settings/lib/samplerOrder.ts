import type { GenerationParams } from "../../../api/client.js"

export function formatSamplerOrder(order: GenerationParams["sampler_order"]): string {
  if (!Array.isArray(order)) return ""
  return order.join(", ")
}

export function parseSamplerOrder(text: string): number[] | null {
  const trimmed = text.trim()
  if (!trimmed) return []
  const parts = trimmed
    .split(",")
    .map((p) => p.trim())
    .filter(Boolean)
  const out: number[] = []
  for (const p of parts) {
    const n = Number(p)
    if (!Number.isFinite(n)) return null
    out.push(Math.trunc(n))
  }
  return out
}
