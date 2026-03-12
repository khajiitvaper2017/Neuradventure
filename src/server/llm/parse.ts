export function parseJsonFromContent(content: string, schemaName: string): unknown {
  const direct = tryParseJson(content)
  if (direct.ok) return direct.value

  const fenced = extractFencedJson(content)
  if (fenced) {
    const fencedParsed = tryParseJson(fenced)
    if (fencedParsed.ok) return fencedParsed.value
  }

  const extracted = extractFirstJsonValue(content)
  if (extracted) {
    const extractedParsed = tryParseJson(extracted)
    if (extractedParsed.ok) return extractedParsed.value
  }

  const preview = content.length > 280 ? `${content.slice(0, 280)}...` : content
  const base = direct.error ? ` (${direct.error.message})` : ""
  throw new Error(`LLM returned invalid JSON for ${schemaName}${base}. Preview: ${preview}`)
}

function tryParseJson(text: string): { ok: true; value: unknown } | { ok: false; error: Error } {
  try {
    return { ok: true, value: JSON.parse(text) }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error : new Error(String(error)) }
  }
}

function extractFencedJson(text: string): string | null {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i)
  return match ? match[1] : null
}

function extractFirstJsonValue(text: string): string | null {
  let start = -1
  let depth = 0
  let inString = false
  let escape = false

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]
    if (start === -1) {
      if (char === "{" || char === "[") {
        start = i
        depth = 1
        inString = false
        escape = false
      }
      continue
    }

    if (inString) {
      if (escape) {
        escape = false
        continue
      }
      if (char === "\\") {
        escape = true
        continue
      }
      if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
      continue
    }

    if (char === "{" || char === "[") {
      depth += 1
      continue
    }
    if (char === "}" || char === "]") {
      depth -= 1
      if (depth === 0) {
        return text.slice(start, i + 1)
      }
    }
  }

  return null
}
