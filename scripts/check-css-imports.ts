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

function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory()
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
    spec.startsWith("~") ||
    spec === "tailwindcss"
  )
}

type PackageJson = {
  exports?: unknown
  main?: unknown
  style?: unknown
}

function readPackageJson(pkgDir: string): PackageJson | null {
  const path = join(pkgDir, "package.json")
  if (!isFile(path)) return null
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as PackageJson
  } catch {
    return null
  }
}

function pickExportTarget(entry: unknown): string | null {
  if (typeof entry === "string") return entry
  if (!entry || typeof entry !== "object") return null
  const obj = entry as Record<string, unknown>
  const style = obj.style
  if (typeof style === "string") return style
  const def = obj.default
  if (typeof def === "string") return def
  const imp = obj.import
  if (typeof imp === "string") return imp
  const req = obj.require
  if (typeof req === "string") return req
  return null
}

function resolveBareCssImport(spec: string): string | null {
  const parts = spec.split("/").filter(Boolean)
  if (parts.length === 0) return null

  const packageName = spec.startsWith("@") ? parts.slice(0, 2).join("/") : parts[0]
  const subpathParts = spec.startsWith("@") ? parts.slice(2) : parts.slice(1)
  const pkgDir = resolve("node_modules", packageName)
  if (!isDirectory(pkgDir)) return null

  const pkgJson = readPackageJson(pkgDir)

  const tryFile = (relativePath: string): string | null => {
    const abs = resolve(pkgDir, relativePath)
    if (isFile(abs)) return abs
    if (!extname(abs) && isFile(`${abs}.css`)) return `${abs}.css`
    return null
  }

  if (subpathParts.length > 0) {
    const subpath = subpathParts.join("/")
    const direct = tryFile(subpath)
    if (direct) return direct

    const exportsObj = pkgJson?.exports
    if (exportsObj && typeof exportsObj === "object") {
      const key = `./${subpath}`
      const entry = (exportsObj as Record<string, unknown>)[key]
      const target = pickExportTarget(entry)
      if (typeof target === "string") {
        const resolved = tryFile(target)
        if (resolved) return resolved
      }
    }
    return null
  }

  const exportsObj = pkgJson?.exports
  if (exportsObj && typeof exportsObj === "object") {
    const entry = (exportsObj as Record<string, unknown>)["."]
    const target = pickExportTarget(entry)
    if (typeof target === "string") {
      const resolved = tryFile(target)
      if (resolved) return resolved
    }
  }

  const styleField = pkgJson?.style
  if (typeof styleField === "string") {
    const resolved = tryFile(styleField)
    if (resolved) return resolved
  }

  const mainField = pkgJson?.main
  if (typeof mainField === "string" && mainField.endsWith(".css")) {
    const resolved = tryFile(mainField)
    if (resolved) return resolved
  }

  return tryFile("index.css")
}

function resolveImport(fromFile: string, spec: string): string | null {
  if (spec.startsWith(".")) {
    const base = resolve(dirname(fromFile), spec)
    if (isFile(base)) return base
    if (!extname(base)) {
      const withCss = `${base}.css`
      if (isFile(withCss)) return withCss
    }
    return base
  }

  return resolveBareCssImport(spec)
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
