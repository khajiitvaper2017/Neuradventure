export type StructuredPreviewPatch = Record<string, unknown>

type ExtractedString = { value: string; closed: boolean }

function isEscaped(text: string, index: number): boolean {
  // index points at a quote; count preceding backslashes
  let backslashes = 0
  for (let i = index - 1; i >= 0 && text[i] === "\\"; i--) backslashes++
  return backslashes % 2 === 1
}

function findUnescapedKeyIndex(text: string, key: string): number {
  const needle = `"${key}"`
  let from = text.length
  while (true) {
    const idx = text.lastIndexOf(needle, from)
    if (idx < 0) return -1
    if (!isEscaped(text, idx)) return idx
    from = idx - 1
  }
}

function extractJsonStringFrom(text: string, startQuoteIndex: number): ExtractedString | null {
  if (startQuoteIndex < 0 || startQuoteIndex >= text.length) return null
  if (text[startQuoteIndex] !== '"') return null

  let out = ""
  for (let i = startQuoteIndex + 1; i < text.length; i++) {
    const ch = text[i]
    if (ch === '"') {
      if (isEscaped(text, i)) {
        out += '"'
        continue
      }
      return { value: out, closed: true }
    }
    if (ch === "\\") {
      const next = text[i + 1]
      if (next === undefined) return { value: out, closed: false }
      // decode common escapes to make previews readable
      if (next === "n") {
        out += "\n"
        i++
        continue
      }
      if (next === "r") {
        out += "\r"
        i++
        continue
      }
      if (next === "t") {
        out += "\t"
        i++
        continue
      }
      if (next === '"') {
        out += '"'
        i++
        continue
      }
      if (next === "\\") {
        out += "\\"
        i++
        continue
      }
      // leave unknown escape as-is (best effort)
      out += next
      i++
      continue
    }
    out += ch
  }
  return { value: out, closed: false }
}

function extractBestEffortStringField(text: string, key: string): string | null {
  const keyIdx = findUnescapedKeyIndex(text, key)
  if (keyIdx < 0) return null

  const afterKey = keyIdx + key.length + 2
  const colonIdx = text.indexOf(":", afterKey)
  if (colonIdx < 0) return null

  let i = colonIdx + 1
  while (i < text.length && /\s/.test(text[i] ?? "")) i++
  if (text[i] !== '"') return null

  const extracted = extractJsonStringFrom(text, i)
  return extracted ? extracted.value : null
}

export function createStructuredPreviewExtractor(keys: string[]) {
  let buffer = ""
  const lastValues = new Map<string, string>()

  const push = (delta: string): StructuredPreviewPatch | null => {
    if (!delta) return null
    buffer += delta

    const patch: StructuredPreviewPatch = {}
    for (const key of keys) {
      const val = extractBestEffortStringField(buffer, key)
      if (val === null) continue
      const prev = lastValues.get(key)
      if (prev === val) continue
      lastValues.set(key, val)
      patch[key] = val
    }

    return Object.keys(patch).length > 0 ? patch : null
  }

  const snapshot = (): StructuredPreviewPatch => {
    const out: StructuredPreviewPatch = {}
    for (const [k, v] of lastValues.entries()) out[k] = v
    return out
  }

  return { push, snapshot }
}
