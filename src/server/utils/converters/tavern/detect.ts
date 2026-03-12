import type { TavernCardV2 } from "./card.js"

export function detectImportFormat(data: unknown): "neuradventure" | "tavern-card" | "tavern-jsonl" | "unknown" {
  if (typeof data === "string") {
    // JSONL check (first line is JSON with chat/meta fields)
    const firstLine = data.split("\n")[0]
    try {
      const parsed = JSON.parse(firstLine) as Record<string, unknown>
      if (
        ("is_user" in parsed && "mes" in parsed) ||
        "user_name" in parsed ||
        "character_name" in parsed ||
        "create_date" in parsed
      ) {
        return "tavern-jsonl"
      }
    } catch {
      // not JSONL
    }
    return "unknown"
  }

  if (data && typeof data === "object") {
    const obj = data as Record<string, unknown>
    if ((obj as TavernCardV2).spec === "chara_card_v2") return "tavern-card"
    if (obj.title && obj.character && obj.world) return "neuradventure"
  }

  return "unknown"
}
