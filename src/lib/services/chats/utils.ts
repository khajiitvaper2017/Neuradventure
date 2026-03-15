export { downloadText } from "@/utils/downloadText"

export function isProbablyOfflineError(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err)
  return msg.includes("Failed to fetch") || msg.includes("NetworkError") || msg.includes("fetch failed")
}
