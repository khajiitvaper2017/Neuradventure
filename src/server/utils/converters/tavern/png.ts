import { inflateSync } from "node:zlib"

type PngTextChunk = {
  type: "tEXt" | "zTXt" | "iTXt"
  keyword: string
  text: string
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])

function isProbablyBase64(value: string): boolean {
  const trimmed = value.trim()
  if (!trimmed || trimmed.length < 64) return false
  if (trimmed.length % 4 !== 0) return false
  return /^[A-Za-z0-9+/=\r\n]+$/.test(trimmed)
}

function decodeNullTerminatedLatin1(buf: Buffer, start: number): { text: string; next: number } {
  const end = buf.indexOf(0x00, start)
  const sliceEnd = end === -1 ? buf.length : end
  return { text: buf.subarray(start, sliceEnd).toString("latin1"), next: end === -1 ? buf.length : end + 1 }
}

function parseTextChunks(png: Buffer): PngTextChunk[] {
  if (png.length < 8 || !png.subarray(0, 8).equals(PNG_SIGNATURE)) return []
  const out: PngTextChunk[] = []
  let offset = 8
  while (offset + 8 <= png.length) {
    const length = png.readUInt32BE(offset)
    const type = png.subarray(offset + 4, offset + 8).toString("ascii")
    const dataStart = offset + 8
    const dataEnd = dataStart + length
    const crcEnd = dataEnd + 4
    if (dataEnd > png.length || crcEnd > png.length) break
    const data = png.subarray(dataStart, dataEnd)

    if (type === "tEXt") {
      const { text: keyword, next } = decodeNullTerminatedLatin1(data, 0)
      const text = data.subarray(next).toString("latin1")
      out.push({ type: "tEXt", keyword, text })
    } else if (type === "zTXt") {
      const { text: keyword, next } = decodeNullTerminatedLatin1(data, 0)
      if (next >= data.length) {
        // ignore
      } else {
        const compressionMethod = data.readUInt8(next)
        if (compressionMethod === 0) {
          try {
            const inflated = inflateSync(data.subarray(next + 1))
            out.push({ type: "zTXt", keyword, text: inflated.toString("latin1") })
          } catch {
            // ignore bad zlib
          }
        }
      }
    } else if (type === "iTXt") {
      // keyword\0 compression_flag compression_method language_tag\0 translated_keyword\0 text
      const { text: keyword, next: afterKeyword } = decodeNullTerminatedLatin1(data, 0)
      if (afterKeyword + 2 > data.length) {
        // ignore
      } else {
        const compressionFlag = data.readUInt8(afterKeyword)
        const compressionMethod = data.readUInt8(afterKeyword + 1)
        const { next: afterLang } = decodeNullTerminatedLatin1(data, afterKeyword + 2)
        const { next: afterTranslated } = decodeNullTerminatedLatin1(data, afterLang)
        const textBytes = data.subarray(afterTranslated)
        if (compressionFlag === 1 && compressionMethod === 0) {
          try {
            const inflated = inflateSync(textBytes)
            out.push({ type: "iTXt", keyword, text: inflated.toString("utf8") })
          } catch {
            // ignore
          }
        } else {
          out.push({ type: "iTXt", keyword, text: textBytes.toString("utf8") })
        }
      }
    }

    if (type === "IEND") break
    offset = crcEnd
  }
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
      const decoded = Buffer.from(trimmed.replace(/\s+/g, ""), "base64").toString("utf8").trim()
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

export function extractCardJsonFromPng(png: Buffer): ExtractedPngCard {
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
