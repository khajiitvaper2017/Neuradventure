export type InlineToken = {
  type: "text" | "code" | "dquote" | "squote"
  content: string
}

type InlineMatch = {
  type: "code" | "dquote" | "squote"
  start: number
  end: number
  inner: string
}

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

export function tokenizeInline(text: string): InlineToken[] {
  if (!text) return []
  const tokens: InlineToken[] = []
  let index = 0
  const priority: Record<InlineMatch["type"], number> = { code: 0, dquote: 1, squote: 2 }
  while (index < text.length) {
    const candidates = [findCode(text, index), findDQuote(text, index), findSQuote(text, index)].filter(
      (m): m is InlineMatch => m !== null,
    )
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
    } else if (next.type === "dquote") {
      tokens.push({ type: "dquote", content: next.inner })
    } else {
      tokens.push({ type: "squote", content: next.inner })
    }
    index = next.end
  }
  return tokens
}
