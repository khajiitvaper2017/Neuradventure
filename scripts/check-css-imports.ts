import { readFileSync, readdirSync, statSync } from "node:fs"
import { dirname, extname, join, resolve } from "node:path"

type ImportIssue = {
  file: string
  spec: string
  resolved?: string
  reason: string
}

const CSS_IMPORT_RE = /@import\s+(?:url\()?["']([^"']+)["']\)?/g

function isFile(path: string): boolean {
  try {
    return statSync(path).isFile()
  } catch {
    return false
  }
}

function collectCssFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      collectCssFiles(full, out)
      continue
    }
    if (entry.isFile() && extname(entry.name) === ".css") out.push(full)
  }
  return out
}

function shouldSkip(spec: string): boolean {
  return (
    spec.startsWith("http://") ||
    spec.startsWith("https://") ||
    spec.startsWith("data:") ||
    spec.startsWith("/") ||
    spec.startsWith("~")
  )
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (!spec.startsWith(".")) return null
  const base = resolve(dirname(fromFile), spec)
  if (isFile(base)) return base
  if (!extname(base)) {
    const withCss = `${base}.css`
    if (isFile(withCss)) return withCss
  }
  return base
}

function checkCssFile(file: string, issues: ImportIssue[]) {
  const content = readFileSync(file, "utf-8")
  const matches = content.matchAll(CSS_IMPORT_RE)
  for (const match of matches) {
    const spec = match[1]?.trim()
    if (!spec || shouldSkip(spec)) continue
    const resolved = resolveImport(file, spec)
    if (!resolved || !isFile(resolved)) {
      issues.push({
        file,
        spec,
        resolved: resolved ?? undefined,
        reason: "import path does not exist",
      })
    }
  }
}

function main() {
  const root = resolve("src")
  const files = collectCssFiles(root)
  const issues: ImportIssue[] = []
  for (const file of files) checkCssFile(file, issues)

  if (issues.length > 0) {
    console.error("[check-css-imports] Invalid @import paths:")
    for (const issue of issues) {
      const resolved = issue.resolved ? ` -> ${issue.resolved}` : ""
      console.error(`- ${issue.file}: "${issue.spec}"${resolved} (${issue.reason})`)
    }
    process.exit(1)
  }
  console.log("CSS import checks OK")
}

try {
  main()
} catch (err) {
  console.error("[check-css-imports] Failed:", err)
  process.exit(1)
}
