import { get } from "svelte/store"
import { timeouts } from "../stores/settings.js"

export type PendingRequestKind =
  | "chat.send"
  | "chat.continue"
  | "chat.regenerate"
  | "generate.story"
  | "generate.character"
  | "generate.chat"

export type PendingRequest<TPayload = unknown> = {
  kind: PendingRequestKind
  requestId: string
  createdAt: number
  payload: TPayload
}

const DEFAULT_TTL_MS = 10 * 60 * 1000

function getTtlMs(): number {
  try {
    const ms = get(timeouts).pendingRequestTtlMs
    return Number.isFinite(ms) ? ms : DEFAULT_TTL_MS
  } catch {
    return DEFAULT_TTL_MS
  }
}

function storageKey(kind: PendingRequestKind) {
  return `pending_request_v1:${kind}`
}

export function getPendingRequest<TPayload>(kind: PendingRequestKind): PendingRequest<TPayload> | null {
  try {
    const raw = window.localStorage.getItem(storageKey(kind))
    if (!raw) return null
    const parsed = JSON.parse(raw) as PendingRequest<TPayload>
    if (!parsed || typeof parsed !== "object") return null
    if (parsed.kind !== kind) return null
    if (typeof parsed.requestId !== "string" || !parsed.requestId.trim()) return null
    if (typeof parsed.createdAt !== "number") return null
    if (Date.now() - parsed.createdAt > getTtlMs()) {
      clearPendingRequest(kind, parsed.requestId)
      return null
    }
    return parsed
  } catch {
    return null
  }
}

export function setPendingRequest<TPayload>(pending: PendingRequest<TPayload>): void {
  try {
    window.localStorage.setItem(storageKey(pending.kind), JSON.stringify(pending))
  } catch {
    // ignore storage failures
  }
}

export function clearPendingRequest(kind: PendingRequestKind, requestId?: string): void {
  try {
    if (requestId) {
      const existing = getPendingRequest(kind)
      if (existing && existing.requestId !== requestId) return
    }
    window.localStorage.removeItem(storageKey(kind))
  } catch {
    // ignore
  }
}
