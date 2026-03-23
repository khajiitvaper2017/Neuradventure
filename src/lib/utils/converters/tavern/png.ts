import { inflate } from "pako"

type PngTextChunk = {
  type: "tEXt" | "zTXt" | "iTXt"
  keyword: string
  text: string
}

const PNG_SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.byteLength !== b.byteLength) return false
  for (let i = 0; i < a.byteLength; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function isProbablyBase64(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length < 64) return false
  if (trimmed.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)
}

function decodeLatin1(bytes: Uint8Array): string {
  let out = ""
  const chunkSize = 8192
  for (let i = 0; i < bytes.length; i += chunkSize) {
    out += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return out
}

function decodeNullTerminatedLatin1(buf: Uint8Array, start: number): { text: string; next: number } {
  let end = start
  while (end < buf.length && buf[end] !== 0x00) end++
  const sliceEnd = end >= buf.length ? buf.length : end
  return { text: decodeLatin1(buf.subarray(start, sliceEnd)), next: end >= buf.length ? buf.length : end + 1 }
}

function readUInt32BE(bytes: Uint8Array, offset: number): number {
  return (
    (((bytes[offset] ?? 0) << 24) |
      ((bytes[offset + 1] ?? 0) << 16) |
      ((bytes[offset + 2] ?? 0) << 8) |
      (bytes[offset + 3] ?? 0)) >>>
    0
  )
}

function decodeAscii(bytes: Uint8Array): string {
  let out = ""
  for (let i = 0; i < bytes.length; i++) out += String.fromCharCode(bytes[i] ?? 0)
  return out
}

function decodeUtf8(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8").decode(bytes)
  } catch {
    // fallback for very old runtimes
    return decodeLatin1(bytes)
  }
}

function parseTextChunks(png: Uint8Array): PngTextChunk[] {
  if (png.length < 8 || !equalBytes(png.subarray(0, 8), PNG_SIGNATURE)) return []
  const out: PngTextChunk[] = []
  let offset = 8

  while (offset + 8 <= png.length) {
    const length = readUInt32BE(png, offset)
    const type = decodeAscii(png.subarray(offset + 4, offset + 8))
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const crcEnd = dataEnd + 4
    if (dataEnd > png.length || crcEnd > png.length) break
    const data = png.subarray(dataStart, dataEnd)

    if (type === "tEXt") {
      const { text: keyword, next } = decodeNullTerminatedLatin1(data, 0)
      const text = decodeLatin1(data.subarray(next))
      out.push({ type: "tEXt", keyword, text })
    } else if (type === "zTXt") {
      const { text: keyword, next } = decodeNullTerminatedLatin1(data, 0)
      if (next < data.length) {
        const compressionMethod = data[next]
        if (compressionMethod === 0) {
          try {
            const inflated = inflate(data.subarray(next + 1))
            out.push({ type: "zTXt", keyword, text: decodeLatin1(inflated) })
          } catch {
            // ignore bad zlib
          }
        }
      }
    } else if (type === "iTXt") {
      // keyword\0 compression_flag compression_method language_tag\0 translated_keyword\0 text
      const { text: keyword, next: afterKeyword } = decodeNullTerminatedLatin1(data, 0)
      if (afterKeyword + 2 <= data.length) {
        const compressionFlag = data[afterKeyword]
        const compressionMethod = data[afterKeyword + 1]
        const { next: afterLang } = decodeNullTerminatedLatin1(data, afterKeyword + 2)
        const { next: afterTranslated } = decodeNullTerminatedLatin1(data, afterLang)
        const textBytes = data.subarray(afterTranslated)
        if (compressionFlag === 1 && compressionMethod === 0) {
          try {
            const inflated = inflate(textBytes)
            out.push({ type: "iTXt", keyword, text: decodeUtf8(inflated) })
          } catch {
            // ignore bad zlib
          }
        } else {
          out.push({ type: "iTXt", keyword, text: decodeUtf8(textBytes) })
        }
      }
    }

    if (type === "IEND") break
    offset = crcEnd
  }

  return out
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const out = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i) & 0xff
  return out
}

function tryParseJsonPayload(text: string): { rawJson: string; data: unknown } | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  // Direct JSON
  if (trimmed.includes("{") && trimmed.includes("}")) {
    try {
      const parsed = JSON.parse(trimmed) as unknown
      return { rawJson: trimmed, data: parsed }
    } catch {
      // fall through
    }
  }

  // Base64 JSON
  if (isProbablyBase64(trimmed)) {
    try {
      const decodedBytes = base64ToBytes(trimmed.replace(/\s+/g, ""))
      const decoded = decodeUtf8(decodedBytes).trim()
      const parsed = JSON.parse(decoded) as unknown
      return { rawJson: decoded, data: parsed }
    } catch {
      // ignore
    }
  }

  return null
}

export type ExtractedPngCard = {
  raw_json: string
  card: unknown
}

export function extractCardJsonFromPng(png: Uint8Array): ExtractedPngCard {
  const chunks = parseTextChunks(png)

  // Prefer common SillyTavern keywords first.
  const ranked = [...chunks].sort((a, b) => {
    const ak = a.keyword.toLowerCase()
    const bk = b.keyword.toLowerCase()
    const aScore = ak === "chara" || ak === "character" ? 0 : ak.includes("chara") ? 1 : 2
    const bScore = bk === "chara" || bk === "character" ? 0 : bk.includes("chara") ? 1 : 2
    return aScore - bScore
  })

  for (const chunk of ranked) {
    const parsed = tryParseJsonPayload(chunk.text)
    if (!parsed) continue
    const obj = parsed.data
    if (obj && typeof obj === "object") {
      const spec = (obj as { spec?: unknown }).spec
      if (spec === "chara_card_v2") return { raw_json: parsed.rawJson, card: parsed.data }
    }
  }

  // Last-chance: accept any JSON object and let higher layers validate.
  for (const chunk of ranked) {
    const parsed = tryParseJsonPayload(chunk.text)
    if (parsed) return { raw_json: parsed.rawJson, card: parsed.data }
  }

  throw new Error("No embedded character card JSON found in PNG")
}
