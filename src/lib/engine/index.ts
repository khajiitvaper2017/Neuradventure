import { initEngineDb } from "@/engine/db/connection"
import { initDb } from "@/engine/db/init"

let initPromise: Promise<void> | null = null

export function initEngine(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    await initEngineDb()
    initDb()
  })().catch((err) => {
    initPromise = null
    throw err
  })
  return initPromise
}
