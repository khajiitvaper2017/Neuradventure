import { migrateDb } from "@/db/migrations"

export function initDb() {
  migrateDb()
}
