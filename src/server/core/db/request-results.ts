import { getDb } from "./connection.js"

export type RequestResultRow = {
  request_id: string
  kind: string
  response_json: string
  created_at: string
}

const MAX_AGE_DAYS = 2

export function getRequestResult(requestId: string): RequestResultRow | null {
  const db = getDb()
  const row = db
    .prepare("SELECT request_id, kind, response_json, created_at FROM request_results WHERE request_id = ?")
    .get(requestId) as RequestResultRow | undefined
  return row ?? null
}

export function setRequestResult(requestId: string, kind: string, response: unknown): void {
  const db = getDb()
  const json = JSON.stringify(response)
  db.prepare(
    "INSERT OR REPLACE INTO request_results (request_id, kind, response_json, created_at) VALUES (?, ?, ?, datetime('now'))",
  ).run(requestId, kind, json)

  db.prepare(`DELETE FROM request_results WHERE created_at < datetime('now', ?)`).run(`-${MAX_AGE_DAYS} days`)
}
