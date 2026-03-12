import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIELDS_PATH = path.resolve(__dirname, "../../../shared/config/fields.json")

const raw = fs.readFileSync(FIELDS_PATH, "utf-8")
export const FIELDS = JSON.parse(raw) as Record<string, unknown>

export function desc(pathKey: string): string {
  const parts = pathKey.split(".")
  let current: unknown = FIELDS
  for (const part of parts) {
    if (!current || typeof current !== "object") break
    current = (current as Record<string, unknown>)[part]
  }
  if (typeof current === "string") return current
  console.warn(`[schema] Missing description for ${pathKey}`)
  return pathKey
}
