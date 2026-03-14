export type InlineToken =
  | { type: "text"; content: string }
  | { type: "code"; content: string }
  | { type: "strong"; content: string }
  | { type: "em"; content: string }
  | { type: "quote"; content: string }
  | { type: "dquote"; content: string }
  | { type: "squote"; content: string }
  | { type: "image"; alt: string; src: string; style: string }

type InlineMatch =
  | { type: "code" | "strong" | "em" | "quote" | "dquote" | "squote"; start: number; end: number; inner: string }
  | { type: "image"; start: number; end: number; alt: string; src: string; style: string }

function isWordChar(ch: string): boolean {
  return /[A-Za-z0-9_]/.test(ch)
}

function isIndexInsideAngleTag(text: string, index: number): boolean {
  const open = text.lastIndexOf("<", index)
  if (open === -1) return false
  const close = text.lastIndexOf(">", index)
  return close < open
}

function findCode(text: string, from: number): InlineMatch | null {
  let start = text.indexOf("`", from)
  while (start !== -1) {
    let run = 0
    while (start + run < text.length && text[start + run] === "`") run += 1
    const delim = "`".repeat(run)
    const close = text.indexOf(delim, start + run)
    if (close === -1) return null
    const inner = text.slice(start + run, close)
    if (inner && !inner.includes("\n")) {
      return { type: "code", start, end: close + run, inner }
    }
    start = text.indexOf("`", start + run)
  }
  return null
}

function findStrong(text: string, from: number): InlineMatch | null {
  let start = text.indexOf("**", from)
  while (start !== -1) {
    const prev = start > 0 ? text[start - 1] : ""
    const next = start + 2 < text.length ? text[start + 2] : ""
    if (prev === "*" || next === "*") {
      start = text.indexOf("**", start + 2)
      continue
    }

    const end = text.indexOf("**", start + 2)
    if (end === -1) return null
    const inner = text.slice(start + 2, end)
    if (inner && !inner.includes("\n") && inner.trim().length > 0) {
      const endNext = end + 2 < text.length ? text[end + 2] : ""
      const isWordyOpen = isWordChar(prev) && isWordChar(next)
      const innerLast = inner[inner.length - 1] ?? ""
      const isWordyClose = isWordChar(innerLast) && isWordChar(endNext)
      if (!isWordyOpen && !isWordyClose) {
        return { type: "strong", start, end: end + 2, inner }
      }
    }
    start = text.indexOf("**", start + 2)
  }
  return null
}

function findTripleQuote(text: string, from: number): InlineMatch | null {
  let start = text.indexOf('"""', from)
  while (start !== -1) {
    const end = text.indexOf('"""', start + 3)
    if (end === -1) return null
    const inner = text.slice(start + 3, end)
    if (inner && !inner.includes("\n") && inner.trim().length > 0) {
      return { type: "quote", start, end: end + 3, inner }
    }
    start = text.indexOf('"""', start + 3)
  }
  return null
}

function findDQuote(text: string, from: number): InlineMatch | null {
  let start = text.indexOf('"', from)
  while (start !== -1) {
    if (isIndexInsideAngleTag(text, start)) {
      start = text.indexOf('"', start + 1)
      continue
    }

    const end = text.indexOf('"', start + 1)
    if (end === -1) return null
    if (isIndexInsideAngleTag(text, end)) {
      start = text.indexOf('"', end + 1)
      continue
    }

    const inner = text.slice(start + 1, end)
    if (inner && !inner.includes("\n") && inner.trim().length > 0) {
      return { type: "dquote", start, end: end + 1, inner }
    }
    start = text.indexOf('"', start + 1)
  }
  return null
}

function findSQuote(text: string, from: number): InlineMatch | null {
  let start = text.indexOf("'", from)
  while (start !== -1) {
    if (isIndexInsideAngleTag(text, start)) {
      start = text.indexOf("'", start + 1)
      continue
    }

    const prev = start > 0 ? text[start - 1] : ""
    const next = start + 1 < text.length ? text[start + 1] : ""
    const looksLikeApostrophe = isWordChar(prev) && isWordChar(next)
    if (looksLikeApostrophe || !next || next === "\n" || next === " ") {
      start = text.indexOf("'", start + 1)
      continue
    }

    let end = start + 1
    while (true) {
      end = text.indexOf("'", end)
      if (end === -1) return null
      if (isIndexInsideAngleTag(text, end)) {
        end += 1
        continue
      }

      const endPrev = end > 0 ? text[end - 1] : ""
      const endNext = end + 1 < text.length ? text[end + 1] : ""
      const endIsApostrophe = isWordChar(endPrev) && isWordChar(endNext)
      if (endIsApostrophe) {
        end += 1
        continue
      }
      break
    }

    const inner = text.slice(start + 1, end)
    if (inner && !inner.includes("\n") && inner.trim().length > 0) {
      return { type: "squote", start, end: end + 1, inner }
    }

    start = text.indexOf("'", start + 1)
  }
  return null
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
  const priority: Record<InlineMatch["type"], number> = {
    code: 0,
    image: 1,
    strong: 2,
    em: 3,
    quote: 4,
    dquote: 5,
    squote: 6,
  }
  while (index < text.length) {
    const candidates = [
      findCode(text, index),
      findImage(text, index),
      findStrong(text, index),
      findEm(text, index),
      findTripleQuote(text, index),
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
    } else if (next.type === "strong") {
      tokens.push({ type: "strong", content: next.inner })
    } else if (next.type === "image") {
      tokens.push({ type: "image", alt: next.alt, src: next.src, style: next.style })
    } else if (next.type === "em") {
      tokens.push({ type: "em", content: next.inner })
    } else if (next.type === "quote") {
      tokens.push({ type: "quote", content: next.inner })
    } else if (next.type === "dquote") {
      tokens.push({ type: "dquote", content: next.inner })
    } else if (next.type === "squote") {
      tokens.push({ type: "squote", content: next.inner })
    }
    index = next.end
  }
  return tokens
}
