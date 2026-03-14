import createDOMPurify, { type Config, type DOMPurify } from "dompurify"
import { tokenizeInline } from "./inlineTokens.js"

const INLINE_ALLOWED_TAGS = [
  "a",
  "b",
  "br",
  "code",
  "em",
  "i",
  "img",
  "kbd",
  "mark",
  "s",
  "small",
  "span",
  "strong",
  "sub",
  "sup",
  "u",
] as const

const BLOCK_ONLY_ALLOWED_TAGS = [
  "blockquote",
  "div",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "li",
  "ol",
  "p",
  "pre",
  "ul",
] as const

const INLINE_ALLOWED_ATTRS = ["alt", "height", "href", "rel", "src", "target", "title", "width"] as const

function stripInlineCodeSpans(text: string): string {
  let out = ""
  let index = 0
  while (index < text.length) {
    const ch = text[index]
    if (ch !== "`") {
      out += ch
      index += 1
      continue
    }

    let run = 0
    while (index + run < text.length && text[index + run] === "`") run += 1
    const delim = "`".repeat(run)
    const close = text.indexOf(delim, index + run)
    if (close === -1) {
      out += delim
      index += run
      continue
    }
    index = close + run
  }
  return out
}

const TAG_NAME_RE = /<\s*\/?\s*([A-Za-z][\w:-]*)\b[^>]*>/g

function hasAllowedTagOutsideCode(text: string, allowed: ReadonlySet<string>): boolean {
  const scan = stripInlineCodeSpans(text)
  TAG_NAME_RE.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = TAG_NAME_RE.exec(scan))) {
    const name = (match[1] ?? "").toLowerCase()
    if (allowed.has(name)) return true
  }
  return false
}

const INLINE_ALLOWED_TAG_SET = new Set<string>(INLINE_ALLOWED_TAGS)
const BLOCK_ALLOWED_TAG_SET = new Set<string>(BLOCK_ONLY_ALLOWED_TAGS)

export function looksLikeHtml(text: string): boolean {
  if (!text) return false
  return hasAllowedTagOutsideCode(text, INLINE_ALLOWED_TAG_SET)
}

export function looksLikeBlockHtml(text: string): boolean {
  if (!text) return false
  return hasAllowedTagOutsideCode(text, BLOCK_ALLOWED_TAG_SET)
}

function escapeHtml(text: string): string {
  return text
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")
}

const HR_RE = /^\s*-{3,}\s*$/

function isHrLine(line: string): boolean {
  return HR_RE.test(line)
}

function renderMarkdownishLineToHtml(line: string): string {
  const tokens = tokenizeInline(line)
  let out = ""
  for (const token of tokens) {
    if (token.type === "text") out += escapeHtml(token.content)
    else if (token.type === "code") out += `<code>${escapeHtml(token.content)}</code>`
    else if (token.type === "strong") out += `<strong>${escapeHtml(token.content)}</strong>`
    else if (token.type === "em") out += `<em>${escapeHtml(token.content)}</em>`
    else if (token.type === "quote") out += `<mark>"""${escapeHtml(token.content)}"""</mark>`
    else if (token.type === "dquote")
      out += `<em><mark>"</mark><mark><em>${escapeHtml(token.content)}</em></mark><mark>"</mark></em>`
    else out += `<img alt="${escapeHtml(token.alt)}" src="${escapeHtml(token.src)}" />`
  }
  return out
}

function renderMarkdownishToHtml(text: string): string {
  if (!text) return ""
  const lines = text.split(/\r?\n/)
  let out = ""
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index] ?? ""
    if (isHrLine(line)) out += "<hr />"
    else out += renderMarkdownishLineToHtml(line)
    if (index < lines.length - 1 && !isHrLine(line)) out += "<br />"
  }
  return out
}

function toRichHtmlPreservingAllowedTags(raw: string, allowedTags: ReadonlySet<string>): string {
  let out = ""
  let buf = ""
  let index = 0

  const flush = () => {
    if (!buf) return
    out += renderMarkdownishToHtml(buf)
    buf = ""
  }

  while (index < raw.length) {
    const ch = raw[index]

    if (ch === "`") {
      let run = 0
      while (index + run < raw.length && raw[index + run] === "`") run += 1
      const delim = "`".repeat(run)
      const close = raw.indexOf(delim, index + run)
      if (close === -1) {
        buf += delim
        index += run
        continue
      }
      buf += raw.slice(index, close + run)
      index = close + run
      continue
    }

    if (ch === "<") {
      const end = raw.indexOf(">", index + 1)
      if (end === -1) {
        buf += ch
        index += 1
        continue
      }

      const candidate = raw.slice(index, end + 1)
      const match = /^<\s*\/?\s*([A-Za-z][\w:-]*)\b[^>]*>$/.exec(candidate)
      if (!match) {
        buf += ch
        index += 1
        continue
      }

      const name = (match[1] ?? "").toLowerCase()
      if (allowedTags.has(name)) {
        flush()
        out += candidate
      } else {
        buf += escapeHtml(candidate)
      }
      index = end + 1
      continue
    }

    buf += ch
    index += 1
  }

  flush()
  return out
}

function isAllowedLinkHref(rawHref: string): boolean {
  const href = rawHref.trim()
  if (!href) return false
  if (href.startsWith("#")) return true
  if (href.startsWith("/")) return true
  if (href.startsWith("./") || href.startsWith("../")) return true
  if (typeof window === "undefined") return false
  try {
    const url = new URL(href, window.location.origin)
    return (
      url.protocol === "http:" || url.protocol === "https:" || url.protocol === "mailto:" || url.protocol === "tel:"
    )
  } catch {
    return false
  }
}

function isAllowedImageSrc(rawSrc: string): boolean {
  const src = rawSrc.trim()
  if (!src) return false
  if (src.startsWith("/")) return true
  if (src.startsWith("./") || src.startsWith("../")) return true
  if (typeof window === "undefined") return false
  try {
    const url = new URL(src, window.location.origin)
    if (url.protocol === "http:" || url.protocol === "https:" || url.protocol === "blob:") return true
    if (url.protocol === "data:") return src.toLowerCase().startsWith("data:image/")
    return false
  } catch {
    return false
  }
}

let purify: DOMPurify | null = null
let hooksInstalled = false

function getPurify(): DOMPurify | null {
  if (purify) return purify
  if (typeof window === "undefined") return null
  purify = createDOMPurify(window)
  if (!hooksInstalled) {
    hooksInstalled = true
    purify.addHook("afterSanitizeAttributes", (node: Element) => {
      const tag = node.tagName.toLowerCase()
      if (tag === "a") {
        const href = node.getAttribute("href")
        if (href && !isAllowedLinkHref(href)) {
          node.removeAttribute("href")
          node.removeAttribute("target")
          node.removeAttribute("rel")
        }

        const target = (node.getAttribute("target") ?? "").toLowerCase()
        if (target === "_blank") {
          const rel = (node.getAttribute("rel") ?? "").split(/\s+/).filter(Boolean)
          const next = new Set(rel.map((v) => v.toLowerCase()))
          next.add("noopener")
          next.add("noreferrer")
          node.setAttribute("rel", Array.from(next).join(" "))
        }
      }

      if (tag === "img") {
        const src = node.getAttribute("src")
        if (src && !isAllowedImageSrc(src)) {
          node.removeAttribute("src")
        }
      }
    })
  }
  return purify
}

function sanitizeWithConfig(raw: string, config: Config): string {
  const p = getPurify()
  if (!p) return escapeHtml(raw)
  const allowedTags = new Set<string>(config.ALLOWED_TAGS ?? [])
  const richHtml = toRichHtmlPreservingAllowedTags(raw, allowedTags)
  return p.sanitize(richHtml, config) as string
}

export function sanitizeInlineHtml(raw: string): string {
  const config: Config = {
    ALLOWED_TAGS: [...INLINE_ALLOWED_TAGS],
    ALLOWED_ATTR: [...INLINE_ALLOWED_ATTRS],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["style"],
    FORBID_TAGS: ["script", "style"],
  }
  return sanitizeWithConfig(raw, config)
}

export function sanitizeBlockHtml(raw: string): string {
  const config: Config = {
    ALLOWED_TAGS: [...INLINE_ALLOWED_TAGS, ...BLOCK_ONLY_ALLOWED_TAGS],
    ALLOWED_ATTR: [...INLINE_ALLOWED_ATTRS],
    ALLOW_ARIA_ATTR: false,
    ALLOW_DATA_ATTR: false,
    FORBID_ATTR: ["style"],
    FORBID_TAGS: ["script", "style"],
  }
  return sanitizeWithConfig(raw, config)
}
