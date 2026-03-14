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

function streamUrl(): string | null {
  if (typeof window === "undefined") return null
  const proto = window.location.protocol === "https:" ? "wss" : "ws"
  return `${proto}://${window.location.host}/api/stream`
}

class StreamClient {
  ws: WebSocket | null = null
  connecting = false
  listenersByRequestId = new Map<string, Set<Listener>>()
  pendingSubscribe = new Set<string>()
  reconnectTimer: number | null = null
  reconnectDelayMs = 250

  hasActiveSubscriptions(): boolean {
    return this.pendingSubscribe.size > 0 || this.listenersByRequestId.size > 0
  }

  scheduleReconnect() {
    if (typeof window === "undefined") return
    if (!this.hasActiveSubscriptions()) return
    if (this.connecting) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.reconnectTimer !== null) return

    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null
      this.ensureConnected()
      this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, 2000)
    }, this.reconnectDelayMs)
  }

  ensureConnected() {
    const url = streamUrl()
    if (!url) return
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) return
    if (this.connecting) return
    this.connecting = true

    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }

    const ws = new WebSocket(url)
    this.ws = ws

    ws.onopen = () => {
      this.connecting = false
      this.reconnectDelayMs = 250
      const ids = new Set<string>()
      for (const id of this.pendingSubscribe) ids.add(id)
      for (const id of this.listenersByRequestId.keys()) ids.add(id)

      for (const id of ids) {
        this.send({ type: "subscribe", request_id: id })
      }
      this.pendingSubscribe.clear()
    }

    ws.onmessage = (ev) => {
      let parsed: unknown
      try {
        parsed = JSON.parse(String(ev.data))
      } catch {
        return
      }
      if (!parsed || typeof parsed !== "object") return
      const msg = parsed as Record<string, unknown>
      const requestId = typeof msg.request_id === "string" ? msg.request_id : null
      if (!requestId) return
      const listeners = this.listenersByRequestId.get(requestId)
      if (!listeners || listeners.size === 0) return
      for (const fn of listeners) fn(parsed as StreamServerMessage)
    }

    const onCloseOrError = () => {
      this.connecting = false
      this.ws = null
      // reconnect lazily on next subscribe
      this.scheduleReconnect()
    }
    ws.onclose = onCloseOrError
    ws.onerror = onCloseOrError
  }

  send(payload: { type: string; request_id: string }) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return
    try {
      this.ws.send(JSON.stringify(payload))
    } catch {
      // ignore
    }
  }

  subscribe(requestId: string, listener: Listener): () => void {
    const trimmed = requestId.trim()
    if (!trimmed) return () => {}
    const set = this.listenersByRequestId.get(trimmed) ?? new Set<Listener>()
    set.add(listener)
    this.listenersByRequestId.set(trimmed, set)

    this.ensureConnected()
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.send({ type: "subscribe", request_id: trimmed })
    } else {
      this.pendingSubscribe.add(trimmed)
    }

    return () => {
      const listeners = this.listenersByRequestId.get(trimmed)
      if (!listeners) return
      listeners.delete(listener)
      if (listeners.size === 0) {
        this.listenersByRequestId.delete(trimmed)
        this.pendingSubscribe.delete(trimmed)
        this.send({ type: "unsubscribe", request_id: trimmed })
      }
    }
  }
}

export const streamClient = new StreamClient()
