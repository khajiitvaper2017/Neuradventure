import { initEngineDb } from "./db/connection.js"
import { initDb } from "./db/init.js"

let initialized = false

export async function initEngine(): Promise<void> {
  if (initialized) return
  initialized = true
  await initEngineDb()
  initDb()
}
