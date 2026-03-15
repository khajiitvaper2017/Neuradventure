import type { ModelInfo } from "@/shared/api-types"

export function isFreeModel(model: ModelInfo): boolean {
  const id = model.id.trim().toLowerCase()
  if (!id) return false
  if (id.endsWith("/free")) return true
  if (id.endsWith(":free")) return true
  const name = (model.name ?? "").trim().toLowerCase()
  if (name.endsWith("free")) return true
  if (name.includes("(free)")) return true
  return false
}

export function supportsJsonSchema(model: ModelInfo): boolean {
  return Array.isArray(model.supported_parameters) && model.supported_parameters.includes("structured_outputs")
}

export function filterModelResults(
  models: ModelInfo[],
  opts: { onlyFree: boolean; onlyJsonSchema: boolean },
): ModelInfo[] {
  let out = models
  if (opts.onlyFree) out = out.filter(isFreeModel)
  if (opts.onlyJsonSchema) out = out.filter(supportsJsonSchema)
  return out
}

function findModelInfoById(models: ModelInfo[], id: string): ModelInfo | null {
  const trimmed = id.trim()
  if (!trimmed) return null
  return models.find((m) => m.id === trimmed) ?? null
}

function formatModelLabel(model: ModelInfo, extraTags: string[] = []): string {
  const parts: string[] = []

  const name = (model.name ?? model.id).trim()
  parts.push(name)

  const ctx =
    typeof model.context_length === "number" && Number.isFinite(model.context_length) ? model.context_length : null
  if (ctx) parts.push(`${ctx.toLocaleString()} ctx`)

  const tags: string[] = []
  if (isFreeModel(model)) tags.push("free")
  if (supportsJsonSchema(model)) tags.push("json_schema")
  else if (Array.isArray(model.supported_parameters) && model.supported_parameters.includes("response_format"))
    tags.push("json_object")

  tags.push(...extraTags.filter((t) => t.trim().length > 0))
  if (tags.length > 0) parts.push(tags.join(", "))

  return parts.join(" · ")
}

export function buildModelSelectOptions(args: {
  models: ModelInfo[]
  currentModel: string
  pinned: Array<{ id: string; label: string }>
  pinnedTags?: (id: string) => string[]
  onlyFree: boolean
  onlyJsonSchema: boolean
}): Array<{ value: string; label: string }> {
  const { models, currentModel, pinned, pinnedTags, onlyFree, onlyJsonSchema } = args
  const out: Array<{ value: string; label: string }> = []
  const seen = new Set<string>()
  const push = (id: string, label: string) => {
    if (!id || seen.has(id)) return
    seen.add(id)
    out.push({ value: id, label })
  }

  const filtered = filterModelResults(models, { onlyFree, onlyJsonSchema })

  if (currentModel) {
    const info = findModelInfoById(models, currentModel)
    push(currentModel, info ? formatModelLabel(info) : currentModel)
  }

  for (const p of pinned) {
    const info = findModelInfoById(models, p.id)
    const tags = pinnedTags?.(p.id) ?? []
    const label = info ? formatModelLabel(info, tags) : p.label
    if (!onlyFree && !onlyJsonSchema) {
      push(p.id, label)
      continue
    }
    if (info && filtered.some((m) => m.id === info.id)) push(p.id, label)
  }

  for (const m of filtered) {
    if (!m.id) continue
    push(m.id, formatModelLabel(m))
  }

  return out
}
