import fs from "node:fs"
import path from "node:path"

type FlatMap = Record<string, string>

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value)
}

function flattenObject(root: Record<string, unknown>): FlatMap {
  const out: FlatMap = {}
  const walk = (node: unknown, prefix: string) => {
    if (!isRecord(node)) return
    for (const [k, v] of Object.entries(node)) {
      const fullKey = prefix ? `${prefix}.${k}` : k
      if (isRecord(v)) {
        walk(v, fullKey)
        continue
      }
      if (typeof v === "string") out[fullKey] = v
    }
  }
  walk(root, "")
  return out
}

function shortestUniqueSuffixes(fullKeys: string[]): Map<string, string> {
  const partsByKey = new Map<string, string[]>()
  const suffixCounts = new Map<string, number>()

  for (const key of fullKeys) {
    const parts = key.split(".").filter(Boolean)
    partsByKey.set(key, parts)
    for (let take = 1; take <= parts.length; take++) {
      const suffix = parts.slice(parts.length - take).join(".")
      suffixCounts.set(suffix, (suffixCounts.get(suffix) ?? 0) + 1)
    }
  }

  const out = new Map<string, string>()
  for (const key of fullKeys) {
    const parts = partsByKey.get(key) ?? []
    let chosen = key
    for (let take = 1; take <= parts.length; take++) {
      const suffix = parts.slice(parts.length - take).join(".")
      if ((suffixCounts.get(suffix) ?? 0) === 1) {
        chosen = suffix
        break
      }
    }
    out.set(key, chosen)
  }
  return out
}

function rewritePlaceholdersInString(value: string, rewrite: (key: string) => string | null): string {
  return value.replace(/\{([^{}]+)\}/g, (match, rawKey: string) => {
    const key = rawKey.trim()
    const next = rewrite(key)
    return next ? `{${next}}` : match
  })
}

function rewriteDeep(value: unknown, rewrite: (key: string) => string | null): unknown {
  if (typeof value === "string") return rewritePlaceholdersInString(value, rewrite)
  if (Array.isArray(value)) return value.map((v) => rewriteDeep(v, rewrite))
  if (isRecord(value)) {
    const out: Record<string, unknown> = {}
    for (const [k, v] of Object.entries(value)) out[k] = rewriteDeep(v, rewrite)
    return out
  }
  return value
}

function main(): void {
  const repoRoot = process.cwd()
  const promptsDir = path.join(repoRoot, "shared", "config", "prompts")
  const schemaFieldsPath = path.join(repoRoot, "shared", "config", "schema-fields.json")
  const settingsFieldsPath = path.join(repoRoot, "shared", "config", "settings-fields.json")

  const schemaFields = JSON.parse(fs.readFileSync(schemaFieldsPath, "utf-8")) as unknown
  const settingsFields = JSON.parse(fs.readFileSync(settingsFieldsPath, "utf-8")) as unknown

  const schemaFlat = flattenObject((schemaFields ?? {}) as Record<string, unknown>)
  const settingsFlat = flattenObject((settingsFields ?? {}) as Record<string, unknown>)

  const allFullKeys = Array.from(new Set([...Object.keys(schemaFlat), ...Object.keys(settingsFlat)])).sort()
  const suffixMap = shortestUniqueSuffixes(allFullKeys)

  const rewrite = (key: string): string | null => {
    // Only rewrite placeholders that are already a fully-qualified known key.
    return suffixMap.has(key) ? suffixMap.get(key)! : null
  }

  const files = fs.readdirSync(promptsDir).filter((f) => f.endsWith(".json"))
  for (const file of files) {
    const fullPath = path.join(promptsDir, file)
    const raw = JSON.parse(fs.readFileSync(fullPath, "utf-8")) as unknown
    const next = rewriteDeep(raw, rewrite)
    fs.writeFileSync(fullPath, JSON.stringify(next, null, 2) + "\n")
  }

  console.log(`Rewrote ${files.length} prompt file(s)`)
}

main()

