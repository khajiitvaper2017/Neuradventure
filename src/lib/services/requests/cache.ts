import { AppError } from "@/errors"
import * as db from "@/db/core"

const inFlight = new Map<string, Promise<unknown>>()

export function setInFlight(requestId: string, task: Promise<unknown>): void {
  inFlight.set(requestId, task)
}

export function clearInFlight(requestId: string): void {
  inFlight.delete(requestId)
}

export function getCachedOrInFlight<T>(requestId: string, kind: string): { cached?: T; inflight?: Promise<T> } {
  const cached = db.getRequestResult(requestId)
  if (cached) {
    if (cached.kind !== kind) throw new AppError(409, `request_id already used for: ${cached.kind}`)
    return { cached: JSON.parse(cached.response_json) as T }
  }
  const inflight = inFlight.get(requestId)
  return inflight ? { inflight: inflight as Promise<T> } : {}
}
