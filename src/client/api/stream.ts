import { subscribe as subscribeLocal } from "../engine/streaming/hub.js"
import type { StreamServerMessage } from "../engine/streaming/hub.js"

export type {
  StreamKind,
  StreamSubscribedMessage,
  StreamPreviewMessage,
  StreamErrorMessage,
  StreamCompleteMessage,
  StreamServerMessage,
} from "../engine/streaming/hub.js"

type Listener = (msg: StreamServerMessage) => void

class StreamClient {
  ensureConnected() {
    // no-op (local hub)
  }

  subscribe(requestId: string, listener: Listener): () => void {
    return subscribeLocal(requestId, listener)
  }
}

export const streamClient = new StreamClient()
