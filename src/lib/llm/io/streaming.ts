import { INTERNAL_STREAM_SESSION_TTL_MS } from "@/config/internal-timeouts"

export type StreamKind = "turn" | "generate.character" | "generate.story" | "generate.chat" | "chat.reply"

export type StreamSubscribedMessage = {
  type: "subscribed"
  request_id: string
  snapshot?: Record<string, unknown>
}

export type StreamPreviewMessage = {
  type: "stream"
  request_id: string
  kind: StreamKind
  event: "preview"
  patch: Record<string, unknown>
}

export type StreamErrorMessage = {
  type: "stream"
  request_id: string
  kind: StreamKind
  event: "error"
  error: string
}

export type StreamCompleteMessage = {
  type: "stream"
  request_id: string
  kind: StreamKind
  event: "complete"
}

export type StreamServerMessage =
  | StreamSubscribedMessage
  | StreamPreviewMessage
  | StreamErrorMessage
  | StreamCompleteMessage

type Listener = (msg: StreamServerMessage) => void

type Session = {
  requestId: string
  kind: StreamKind
  snapshot: Record<string, unknown>
  subscribers: Set<Listener>
  cleanupTimer: number | null
}

const sessions = new Map<string, Session>()

function scheduleCleanup(session: Session): void {
  if (typeof window === "undefined") return
  if (session.cleanupTimer !== null) return
  session.cleanupTimer = window.setTimeout(() => {
    sessions.delete(session.requestId)
  }, INTERNAL_STREAM_SESSION_TTL_MS)
}

export function createOrGetSession(requestId: string, kind: StreamKind): Session {
  const existing = sessions.get(requestId)
  if (existing) {
    existing.kind = kind
    if (existing.cleanupTimer !== null) {
      window.clearTimeout(existing.cleanupTimer)
      existing.cleanupTimer = null
    }
    return existing
  }

  const session: Session = {
    requestId,
    kind,
    snapshot: {},
    subscribers: new Set(),
    cleanupTimer: null,
  }
  sessions.set(requestId, session)
  return session
}

export function subscribe(requestId: string, listener: Listener): () => void {
  const trimmed = requestId.trim()
  if (!trimmed) return () => {}

  const session = sessions.get(trimmed) ?? createOrGetSession(trimmed, "turn")
  session.subscribers.add(listener)

  listener({
    type: "subscribed",
    request_id: trimmed,
    snapshot: Object.keys(session.snapshot).length > 0 ? session.snapshot : undefined,
  })

  return () => {
    const current = sessions.get(trimmed)
    if (!current) return
    current.subscribers.delete(listener)
    if (current.subscribers.size === 0) scheduleCleanup(current)
  }
}

export function publishPreview(requestId: string, patch: Record<string, unknown>): void {
  const session = sessions.get(requestId)
  if (!session) return
  if (session.cleanupTimer !== null) {
    window.clearTimeout(session.cleanupTimer)
    session.cleanupTimer = null
  }

  session.snapshot = { ...session.snapshot, ...patch }
  for (const fn of session.subscribers) {
    fn({
      type: "stream",
      request_id: requestId,
      kind: session.kind,
      event: "preview",
      patch,
    })
  }
}

export function publishError(requestId: string, error: string): void {
  const session = sessions.get(requestId)
  if (!session) return
  for (const fn of session.subscribers) {
    fn({
      type: "stream",
      request_id: requestId,
      kind: session.kind,
      event: "error",
      error,
    })
  }
  scheduleCleanup(session)
}

export function publishComplete(requestId: string): void {
  const session = sessions.get(requestId)
  if (!session) return
  for (const fn of session.subscribers) {
    fn({
      type: "stream",
      request_id: requestId,
      kind: session.kind,
      event: "complete",
    })
  }
  scheduleCleanup(session)
}
