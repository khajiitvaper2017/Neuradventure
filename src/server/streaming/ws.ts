import type { WebSocketServer, WebSocket } from "ws"
import { subscribeSocket, unsubscribeSocket, unsubscribeSocketFromAll } from "./hub.js"

type SubscribeMessage = {
  type: "subscribe"
  request_id: string
}

type UnsubscribeMessage = {
  type: "unsubscribe"
  request_id: string
}

type ClientMessage = SubscribeMessage | UnsubscribeMessage

function parseClientMessage(raw: unknown): ClientMessage | null {
  if (!raw || typeof raw !== "object") return null
  const obj = raw as Record<string, unknown>
  const type = obj.type
  const requestId = obj.request_id
  if (typeof type !== "string") return null
  if (typeof requestId !== "string" || !requestId.trim()) return null
  if (type === "subscribe") return { type: "subscribe", request_id: requestId.trim() }
  if (type === "unsubscribe") return { type: "unsubscribe", request_id: requestId.trim() }
  return null
}

function safeClose(ws: WebSocket, code: number, reason: string): void {
  try {
    ws.close(code, reason)
  } catch {
    // ignore
  }
}

export function attachStreamWebSocketServer(wss: WebSocketServer): void {
  wss.on("connection", (ws) => {
    ws.on("message", (data) => {
      let parsed: unknown
      try {
        const text = typeof data === "string" ? data : data.toString("utf-8")
        parsed = JSON.parse(text)
      } catch {
        safeClose(ws, 1003, "Invalid JSON")
        return
      }

      const msg = parseClientMessage(parsed)
      if (!msg) {
        safeClose(ws, 1003, "Invalid message")
        return
      }

      if (msg.type === "subscribe") {
        subscribeSocket(ws, msg.request_id)
        return
      }
      if (msg.type === "unsubscribe") {
        unsubscribeSocket(ws, msg.request_id)
      }
    })

    ws.on("close", () => unsubscribeSocketFromAll(ws))
    ws.on("error", () => unsubscribeSocketFromAll(ws))
  })
}
