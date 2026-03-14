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

const TTL_MS = 10 * 60 * 1000

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
    if (Date.now() - parsed.createdAt > TTL_MS) {
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
