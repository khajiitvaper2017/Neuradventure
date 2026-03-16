import { streamClient } from "@/services/stream"

export function subscribeStreamPreview(
  requestId: string,
  onPatch: (patch: Record<string, unknown>) => void,
): () => void {
  return streamClient.subscribe(requestId, (msg) => {
    if (msg.type === "subscribed") {
      if (msg.snapshot) onPatch((msg.snapshot ?? {}) as Record<string, unknown>)
      return
    }

    if (msg.type === "stream" && msg.event === "preview") {
      onPatch((msg.patch ?? {}) as Record<string, unknown>)
    }
  })
}
