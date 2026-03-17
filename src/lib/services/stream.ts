import { subscribe as subscribeLocal } from "@/llm/io/streaming"
import type { StreamServerMessage } from "@/llm/io/streaming"

export type {
  StreamKind,
  StreamSubscribedMessage,
  StreamPreviewMessage,
  StreamErrorMessage,
  StreamCompleteMessage,
  StreamServerMessage,
} from "@/llm/io/streaming"

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
