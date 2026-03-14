import WebSocket from "ws"
import { getSettings } from "../core/db.js"

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

type Session = {
  requestId: string
  kind: StreamKind
  snapshot: Record<string, unknown>
  subscribers: Set<WebSocket>
  cleanupTimer: NodeJS.Timeout | null
}

const sessions = new Map<string, Session>()
const subscribedIdsBySocket = new WeakMap<WebSocket, Set<string>>()

function safeSend(ws: WebSocket, msg: StreamServerMessage): void {
  if (ws.readyState !== WebSocket.OPEN) return
  try {
    ws.send(JSON.stringify(msg))
  } catch {
    // ignore broken sockets
  }
}

function scheduleCleanup(session: Session): void {
  if (session.cleanupTimer) return
  const ttlMs = getSettings().timeouts.streamSessionTtlMs
  session.cleanupTimer = setTimeout(() => {
    sessions.delete(session.requestId)
  }, ttlMs)
}

export function createOrGetSession(requestId: string, kind: StreamKind): Session {
  const existing = sessions.get(requestId)
  if (existing) {
    existing.kind = kind
    if (existing.cleanupTimer) {
      clearTimeout(existing.cleanupTimer)
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

export function subscribeSocket(ws: WebSocket, requestId: string): void {
  const session = sessions.get(requestId) ?? createOrGetSession(requestId, "turn")
  session.subscribers.add(ws)

  const set = subscribedIdsBySocket.get(ws) ?? new Set<string>()
  set.add(requestId)
  subscribedIdsBySocket.set(ws, set)

  safeSend(ws, {
    type: "subscribed",
    request_id: requestId,
    snapshot: Object.keys(session.snapshot).length > 0 ? session.snapshot : undefined,
  })
}

export function unsubscribeSocket(ws: WebSocket, requestId: string): void {
  const session = sessions.get(requestId)
  if (session) {
    session.subscribers.delete(ws)
    if (session.subscribers.size === 0) scheduleCleanup(session)
  }

  const set = subscribedIdsBySocket.get(ws)
  if (set) {
    set.delete(requestId)
    if (set.size === 0) subscribedIdsBySocket.delete(ws)
  }
}

export function unsubscribeSocketFromAll(ws: WebSocket): void {
  const ids = subscribedIdsBySocket.get(ws)
  if (!ids) return
  for (const id of ids) {
    const session = sessions.get(id)
    session?.subscribers.delete(ws)
    if (session && session.subscribers.size === 0) scheduleCleanup(session)
  }
  subscribedIdsBySocket.delete(ws)
}

export function publishPreview(requestId: string, patch: Record<string, unknown>): void {
  const session = sessions.get(requestId)
  if (!session) return
  if (session.cleanupTimer) {
    clearTimeout(session.cleanupTimer)
    session.cleanupTimer = null
  }

  session.snapshot = { ...session.snapshot, ...patch }
  for (const ws of session.subscribers) {
    safeSend(ws, {
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
  for (const ws of session.subscribers) {
    safeSend(ws, {
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
  for (const ws of session.subscribers) {
    safeSend(ws, {
      type: "stream",
      request_id: requestId,
      kind: session.kind,
      event: "complete",
    })
  }
  scheduleCleanup(session)
}
