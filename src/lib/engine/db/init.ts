import { migrateDb } from "@/engine/db/migrations"

export function initDb() {
  migrateDb()
}
