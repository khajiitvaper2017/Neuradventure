function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null
  return value as Record<string, unknown>
}

export function isAsyncIterable(value: unknown): value is AsyncIterable<unknown> {
  if (!value || typeof value !== "object") return false
  return typeof (value as Record<string | symbol, unknown>)[Symbol.asyncIterator] === "function"
}

function extractErrorMessage(value: unknown): string | null {
  const obj = asRecord(value)
  if (!obj) return null
  const err = obj.error
  const errObj = asRecord(err)
  const msg = errObj ? errObj.message : null
  return typeof msg === "string" && msg.trim() ? msg.trim() : null
}

function extractContentFromChoices(value: unknown): string | null {
  const obj = asRecord(value)
  if (!obj) return null
  const choices = obj.choices
  if (!Array.isArray(choices) || choices.length === 0) return null
  const first = asRecord(choices[0])
  if (!first) return null

  const message = asRecord(first.message)
  const msgContent = message?.content
  if (typeof msgContent === "string" && msgContent) return msgContent
  if (Array.isArray(msgContent)) {
    const parts = msgContent
      .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
      .filter((p): p is Record<string, unknown> => !!p)
    const textParts = parts
      .map((p) => {
        const type = p.type
        if (type === "text" && typeof p.text === "string") return p.text
        return null
      })
      .filter((t): t is string => typeof t === "string" && t.length > 0)
    const joined = textParts.join("")
    if (joined) return joined
  }

  const delta = asRecord(first.delta)
  const deltaContent = delta?.content
  if (typeof deltaContent === "string" && deltaContent) return deltaContent
  if (Array.isArray(deltaContent)) {
    const parts = deltaContent
      .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
      .filter((p): p is Record<string, unknown> => !!p)
    const textParts = parts
      .map((p) => {
        const type = p.type
        if (type === "text" && typeof p.text === "string") return p.text
        return null
      })
      .filter((t): t is string => typeof t === "string" && t.length > 0)
    const joined = textParts.join("")
    if (joined) return joined
  }

  const text = first.text
  if (typeof text === "string" && text) return text

  return null
}

function extractTextDeltaFromContent(value: unknown): string {
  if (typeof value === "string") return value
  if (!Array.isArray(value)) return ""
  const parts = value
    .map((p) => (p && typeof p === "object" ? (p as Record<string, unknown>) : null))
    .filter((p): p is Record<string, unknown> => !!p)
  const textParts = parts
    .map((p) => {
      const type = p.type
      if (type === "text" && typeof p.text === "string") return p.text
      return null
    })
    .filter((t): t is string => typeof t === "string" && t.length > 0)
  return textParts.join("")
}

function extractTextDeltaFromStreamChunk(chunk: unknown): string {
  if (!chunk || typeof chunk !== "object") return ""
  const choices = (chunk as Record<string, unknown>).choices
  if (!Array.isArray(choices) || choices.length === 0) return ""
  const first = (choices[0] ?? null) as Record<string, unknown> | null
  if (!first) return ""

  const delta = first.delta as Record<string, unknown> | undefined
  const deltaContent = delta?.content
  const deltaText = extractTextDeltaFromContent(deltaContent)
  if (deltaText) return deltaText

  const message = first.message as Record<string, unknown> | undefined
  const msgContent = message?.content
  return extractTextDeltaFromContent(msgContent)
}

export async function readStreamedText(
  stream: AsyncIterable<unknown>,
  onDelta?: (delta: string, full: string) => void,
): Promise<string> {
  let out = ""
  for await (const chunk of stream) {
    const delta = extractTextDeltaFromStreamChunk(chunk)
    if (!delta) continue
    out += delta
    onDelta?.(delta, out)
  }
  return out
}

type ResponseLike = {
  json?: () => Promise<unknown>
  text?: () => Promise<string>
  status?: unknown
  ok?: unknown
}

function isResponseLike(value: unknown): value is ResponseLike {
  const obj = asRecord(value)
  if (!obj) return false
  return typeof obj.json === "function" || typeof obj.text === "function"
}

export function describeResponseShape(value: unknown): string {
  if (!value) return String(value)
  if (typeof value !== "object") return typeof value
  const obj = value as Record<string, unknown>
  const ctor = (value as { constructor?: { name?: unknown } }).constructor?.name
  const keys = Object.keys(obj).slice(0, 40)
  return JSON.stringify({ ctor: typeof ctor === "string" ? ctor : undefined, keys })
}

type ReadableStreamLike = {
  getReader: () => { read: () => Promise<{ done: boolean; value?: Uint8Array }>; releaseLock?: () => void }
}

function isReadableStreamLike(value: unknown): value is ReadableStreamLike {
  const obj = asRecord(value)
  return !!obj && typeof obj.getReader === "function"
}

async function readReadableStreamText(stream: ReadableStreamLike, limitBytes = 2_000_000): Promise<string> {
  const reader = stream.getReader()
  const decoder = new TextDecoder()
  let out = ""
  let readBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      readBytes += value.byteLength
      if (readBytes > limitBytes) break
      out += decoder.decode(value, { stream: true })
    }
    out += decoder.decode()
    return out
  } finally {
    reader.releaseLock?.()
  }
}

export async function extractContentFromUnknown(res: unknown): Promise<string | null> {
  if (isAsyncIterable(res)) return await readStreamedText(res)

  const errMsg = extractErrorMessage(res)
  if (errMsg) throw new Error(`LLM returned error payload: ${errMsg}`)

  const direct = extractContentFromChoices(res)
  if (direct) return direct

  const obj = asRecord(res)
  if (obj) {
    const body = obj.body
    if (isReadableStreamLike(body)) {
      const text = await readReadableStreamText(body)
      if (text && text.trim()) return text
    }

    const data = obj.data
    const fromData = extractContentFromChoices(data)
    if (fromData) return fromData

    const result = obj.result
    const fromResult = extractContentFromChoices(result)
    if (fromResult) return fromResult
  }

  if (isResponseLike(res)) {
    try {
      const payload = typeof res.json === "function" ? await res.json() : null
      const fromJson = extractContentFromChoices(payload)
      if (fromJson) return fromJson
      const msg = extractErrorMessage(payload)
      if (msg) throw new Error(`LLM returned error payload: ${msg}`)
    } catch {
      // ignore, try text fallback
    }

    if (typeof res.text === "function") {
      const text = await res.text()
      if (text && text.trim()) return text
    }
  }

  if (isReadableStreamLike(res)) {
    const text = await readReadableStreamText(res)
    if (text && text.trim()) return text
  }

  return null
}

export function shouldRetryWithoutStream(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  if (!msg) return false
  if (!/stream/i.test(msg)) return false
  return /(unknown|unrecognized|unsupported|unexpected|additional property|not allowed|invalid)/i.test(msg)
}
