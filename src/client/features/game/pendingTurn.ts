export type PendingTurn = {
  storyId: number
  actionMode: "do" | "say" | "story"
  playerInput: string
  requestId: string
  lastTurnId: number | null
  createdAt: number
}

const PENDING_TURN_KEY = "pending_turn"

export function getPendingTurn(): PendingTurn | null {
  try {
    const raw = window.localStorage.getItem(PENDING_TURN_KEY)
    if (!raw) return null
    return JSON.parse(raw) as PendingTurn
  } catch {
    return null
  }
}

export function setPendingTurn(pending: PendingTurn) {
  try {
    window.localStorage.setItem(PENDING_TURN_KEY, JSON.stringify(pending))
  } catch {
    // ignore storage failures
  }
}

export function clearPendingTurn() {
  try {
    window.localStorage.removeItem(PENDING_TURN_KEY)
  } catch {
    // ignore storage failures
  }
}
