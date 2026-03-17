import initSqlJs from "sql.js"
import type { Database as SqlJsDatabase, SqlJsStatic } from "sql.js"
import sqlWasmUrl from "sql.js/dist/sql-wasm.wasm?url"
import { openDB, type IDBPDatabase } from "idb"

type PersistSchema = {
  files: {
    key: string
    value: Uint8Array
  }
}

const PERSIST_DB_NAME = "neuradventure_sqljs_v1"
const PERSIST_STORE = "files"
const PERSIST_KEY = "neuradventure.db"
const DB_WRITE_LOCK = "neuradventure_sqljs_write_v1"
const DB_BROADCAST_CHANNEL = "neuradventure_db_updates_v1"

let sqlPromise: Promise<SqlJsStatic> | null = null
let db: SqlJsDatabase | null = null
let persistDb: IDBPDatabase<PersistSchema> | null = null

let persistTimer: number | null = null
let dirty = false

function canUseNavigatorLocks(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "locks" in navigator &&
    !!(navigator as unknown as { locks?: { request?: unknown } }).locks &&
    typeof (navigator as unknown as { locks: { request: unknown } }).locks.request === "function"
  )
}

async function withDbWriteLock<T>(fn: () => Promise<T>): Promise<T> {
  if (!canUseNavigatorLocks()) return await fn()
  const locks = (
    navigator as unknown as {
      locks: { request: (name: string, options: { mode: "exclusive" }, cb: () => Promise<T>) => Promise<T> }
    }
  ).locks
  return await locks.request(DB_WRITE_LOCK, { mode: "exclusive" }, fn)
}

function publishDbUpdated(): void {
  if (typeof window === "undefined") return
  const detail = { at: Date.now() }
  try {
    if (typeof BroadcastChannel !== "undefined") {
      const bc = new BroadcastChannel(DB_BROADCAST_CHANNEL)
      bc.postMessage({ type: "db_updated", ...detail })
      bc.close()
    }
  } catch {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent("neuradventure:db-updated", { detail }))
  } catch {
    // ignore
  }
}

function schedulePersist() {
  dirty = true
  if (typeof window === "undefined") return
  if (persistTimer !== null) return

  const flushSoon = () => {
    persistTimer = null
    void flushDb()
  }

  if (typeof window.requestIdleCallback === "function") {
    persistTimer = window.setTimeout(() => window.requestIdleCallback(flushSoon, { timeout: 1500 }), 200)
  } else {
    persistTimer = window.setTimeout(flushSoon, 650)
  }
}

async function getPersistDb(): Promise<IDBPDatabase<PersistSchema>> {
  if (persistDb) return persistDb
  persistDb = await openDB<PersistSchema>(PERSIST_DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(PERSIST_STORE)) {
        db.createObjectStore(PERSIST_STORE)
      }
    },
  })
  return persistDb
}

async function loadPersistedBytes(): Promise<Uint8Array | null> {
  try {
    const idb = await getPersistDb()
    const val = await idb.get(PERSIST_STORE, PERSIST_KEY)
    if (!val) return null
    if (val instanceof Uint8Array) return val
    if ((val as unknown as object) instanceof ArrayBuffer) return new Uint8Array(val as unknown as ArrayBuffer)
    return null
  } catch {
    return null
  }
}

async function savePersistedBytes(bytes: Uint8Array): Promise<void> {
  const idb = await getPersistDb()
  await withDbWriteLock(async () => {
    await idb.put(PERSIST_STORE, bytes, PERSIST_KEY)
  })
}

async function getSql(): Promise<SqlJsStatic> {
  if (sqlPromise) return sqlPromise
  sqlPromise = initSqlJs({
    locateFile: () => sqlWasmUrl,
  })
  return sqlPromise
}

export type StatementResult = {
  changes: number
  lastInsertRowid: number
}

export type PreparedStatement = {
  get: (...params: unknown[]) => unknown
  all: (...params: unknown[]) => unknown[]
  run: (...params: unknown[]) => StatementResult
}

export type EngineDb = {
  exec: (sql: string) => void
  prepare: (sql: string) => PreparedStatement
  transaction: <TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => TReturn) => (...args: TArgs) => TReturn
}

function normalizeParams(params: unknown[]): unknown[] | Record<string, unknown> | undefined {
  if (params.length === 0) return undefined
  if (params.length === 1) {
    const only = params[0]
    if (Array.isArray(only)) return only
    if (only && typeof only === "object") return only as Record<string, unknown>
    return [only]
  }
  return params
}

function requireDb(): SqlJsDatabase {
  if (!db) throw new Error("Database not initialized")
  return db
}

export async function initEngineDb(): Promise<void> {
  if (db) return
  const SQL = await getSql()
  const bytes = await loadPersistedBytes()
  db = bytes ? new SQL.Database(bytes) : new SQL.Database()

  if (typeof window !== "undefined") {
    window.addEventListener("pagehide", () => {
      void flushDb()
    })
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") void flushDb()
    })
  }
}

export async function flushDb(): Promise<void> {
  if (!dirty) return
  const current = db
  if (!current) return
  try {
    const bytes = current.export()
    await savePersistedBytes(bytes)
    dirty = false
    publishDbUpdated()
  } catch {
    // ignore persistence errors
  }
}

export function exportDbBytes(): Uint8Array {
  const current = requireDb()
  return current.export()
}

export async function restoreDbBytes(bytes: Uint8Array): Promise<void> {
  const SQL = await getSql()
  const next = new SQL.Database(bytes)
  await savePersistedBytes(bytes)
  db = next
  dirty = false
  persistTimer = null
  publishDbUpdated()
}

export function getDb(): EngineDb {
  const database = requireDb()

  const exec = (sql: string) => {
    database.exec(sql)
    schedulePersist()
  }

  const prepare = (sql: string): PreparedStatement => {
    return {
      get: (...params: unknown[]) => {
        const bound = normalizeParams(params)
        const stmt = database.prepare(sql)
        try {
          if (bound !== undefined) stmt.bind(bound as never)
          if (!stmt.step()) return undefined
          return stmt.getAsObject()
        } finally {
          stmt.free()
        }
      },
      all: (...params: unknown[]) => {
        const bound = normalizeParams(params)
        const stmt = database.prepare(sql)
        try {
          if (bound !== undefined) stmt.bind(bound as never)
          const out: unknown[] = []
          while (stmt.step()) out.push(stmt.getAsObject())
          return out
        } finally {
          stmt.free()
        }
      },
      run: (...params: unknown[]) => {
        const bound = normalizeParams(params)
        const stmt = database.prepare(sql)
        try {
          if (bound !== undefined) stmt.bind(bound as never)
          // For statements that don't return rows, stepping executes the statement.
          // Some statements may step 0 times; that's fine.
          while (stmt.step()) {
            // drain
          }
          const changes = database.getRowsModified()
          const row = database.exec("SELECT last_insert_rowid() as id")[0]
          const lastInsertRowid =
            row && Array.isArray(row.values) && row.values[0] && typeof row.values[0][0] === "number"
              ? Number(row.values[0][0])
              : 0
          schedulePersist()
          return { changes, lastInsertRowid }
        } finally {
          stmt.free()
        }
      },
    }
  }

  const transaction = <TArgs extends unknown[], TReturn>(fn: (...args: TArgs) => TReturn) => {
    return (...args: TArgs) => {
      database.exec("BEGIN")
      try {
        const result = fn(...args)
        database.exec("COMMIT")
        schedulePersist()
        return result
      } catch (err) {
        try {
          database.exec("ROLLBACK")
        } catch {
          // ignore
        }
        throw err
      }
    }
  }

  return { exec, prepare, transaction }
}
