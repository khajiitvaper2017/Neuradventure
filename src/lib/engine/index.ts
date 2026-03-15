import { initEngineDb } from "@/engine/db/connection"
import { initDb } from "@/engine/db/init"

let initialized = false

export async function initEngine(): Promise<void> {
  if (initialized) return
  initialized = true
  await initEngineDb()
  initDb()
}
