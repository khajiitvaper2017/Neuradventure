export type InlineToken =
  | { type: "text"; content: string }
  | { type: "code"; content: string }
  | { type: "em"; content: string }
  | { type: "dquote"; content: string }
  | { type: "squote"; content: string }
  | { type: "image"; alt: string; src: string; style: string }

type InlineMatch =
  | { type: "code" | "em" | "dquote" | "squote"; start: number; end: number; inner: string }
  | { type: "image"; start: number; end: number; alt: string; src: string; style: string }

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch)
}

function isApostrophe(text: string, index: number): boolean {
  const prev = index > 0 ? text[index - 1] : ""
  const next = index + 1 < text.length ? text[index + 1] : ""
  return isWordChar(prev) && isWordChar(next)
}

function findCode(text: string, from: number): InlineMatch | null {
  const re = /`([^`\n]+)`/g
  re.lastIndex = from
  const match = re.exec(text)
  if (!match) return null
  return { type: "code", start: match.index, end: match.index + match[0].length, inner: match[1] }
}

function findEm(text: string, from: number): InlineMatch | null {
  let start = text.indexOf("*", from)
  while (start !== -1) {
    const prev = start > 0 ? text[start - 1] : ""
    const next = start + 1 < text.length ? text[start + 1] : ""
    if (next === "*" || prev === "*") {
      start = text.indexOf("*", start + 1)
      continue
    }

    let end = text.indexOf("*", start + 1)
    while (end !== -1) {
      const endPrev = end > 0 ? text[end - 1] : ""
      const endNext = end + 1 < text.length ? text[end + 1] : ""
      if (endNext === "*" || endPrev === "*") {
        end = text.indexOf("*", end + 1)
        continue
      }

      const inner = text.slice(start + 1, end)
      if (inner && !inner.includes("\n") && inner.trim().length > 0) {
        const isWordyOpen = isWordChar(prev) && isWordChar(next)
        const innerLast = inner[inner.length - 1] ?? ""
        const isWordyClose = isWordChar(innerLast) && isWordChar(endNext)
        if (!isWordyOpen && !isWordyClose) {
          return { type: "em", start, end: end + 1, inner }
        }
      }
      break
    }

    start = text.indexOf("*", start + 1)
  }
  return null
}

function findDQuote(text: string, from: number): InlineMatch | null {
  const re = /"([^"\n]+)"/g
  re.lastIndex = from
  const match = re.exec(text)
  if (!match) return null
  return { type: "dquote", start: match.index, end: match.index + match[0].length, inner: match[1] }
}

function findSQuote(text: string, from: number): InlineMatch | null {
  let start = text.indexOf("'", from)
  while (start !== -1) {
    const prev = start > 0 ? text[start - 1] : ""
    if (!isApostrophe(text, start) && !isWordChar(prev)) {
      let end = start + 1
      while (end < text.length) {
        if (text[end] === "'" && !isApostrophe(text, end)) {
          const inner = text.slice(start + 1, end)
          if (!inner.includes("\n")) {
            return { type: "squote", start, end: end + 1, inner }
          }
          break
        }
        end += 1
      }
    }
    start = text.indexOf("'", start + 1)
  }
  return null
}

function normalizeCssDimension(raw: string): string | null {
  const trimmed = raw.trim()
  if (!trimmed) return null
  if (!/^\d+(?:\.\d+)?%?$/.test(trimmed)) return null
  return trimmed.endsWith("%") ? trimmed : `${trimmed}px`
}

function buildImageStyle(widthRaw?: string, heightRaw?: string): string {
  const width = widthRaw ? normalizeCssDimension(widthRaw) : null
  const height = heightRaw ? normalizeCssDimension(heightRaw) : null
  const styleParts: string[] = []
  if (width) styleParts.push(`width:${width}`)
  if (height) styleParts.push(`max-height:${height}`)
  styleParts.push("height:auto")
  return styleParts.join(";")
}

function findImage(text: string, from: number): InlineMatch | null {
  const re = /!\[([^\]\n]*)\]\(\s*([^\s)\n]+)\s*(?:=\s*([0-9.]+%?)(?:x([0-9.]+%?))?)?\s*\)/g
  re.lastIndex = from
  const match = re.exec(text)
  if (!match) return null
  const alt = match[1] ?? ""
  const src = match[2] ?? ""
  const style = buildImageStyle(match[3], match[4])
  return { type: "image", start: match.index, end: match.index + match[0].length, alt, src, style }
}

export function tokenizeInline(text: string): InlineToken[] {
  if (!text) return []
  const tokens: InlineToken[] = []
  let index = 0
  const priority: Record<InlineMatch["type"], number> = { code: 0, image: 1, em: 2, dquote: 3, squote: 4 }
  while (index < text.length) {
    const candidates = [
      findCode(text, index),
      findImage(text, index),
      findEm(text, index),
      findDQuote(text, index),
      findSQuote(text, index),
    ].filter((m): m is InlineMatch => m !== null)
    if (candidates.length === 0) {
      tokens.push({ type: "text", content: text.substring(index) })
      break
    }
    candidates.sort((a, b) => (a.start === b.start ? priority[a.type] - priority[b.type] : a.start - b.start))
    const next = candidates[0]
    if (next.start > index) {
      tokens.push({ type: "text", content: text.substring(index, next.start) })
    }
    if (next.type === "code") {
      tokens.push({ type: "code", content: next.inner })
    } else if (next.type === "image") {
      tokens.push({ type: "image", alt: next.alt, src: next.src, style: next.style })
    } else if (next.type === "em") {
      tokens.push({ type: "em", content: next.inner })
    } else if (next.type === "dquote") {
      tokens.push({ type: "dquote", content: next.inner })
    } else {
      tokens.push({ type: "squote", content: next.inner })
    }
    index = next.end
  }
  return tokens
}
