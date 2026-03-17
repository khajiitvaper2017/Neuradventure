import { initEngineDb } from "@/db/connection"
import { initDb } from "@/db/init"
import { initConnectorApiKeySecrets } from "@/secrets/connector-api-keys"

let initPromise: Promise<void> | null = null

export function initEngine(): Promise<void> {
  if (initPromise) return initPromise
  initPromise = (async () => {
    await initEngineDb()
    initDb()
    await initConnectorApiKeySecrets()
  })().catch((err) => {
    initPromise = null
    throw err
  })
  return initPromise
}
