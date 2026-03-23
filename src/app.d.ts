/// <reference types="@sveltejs/kit" />
/// <reference types="vite-plugin-pwa/client" />
/// <reference types="vite-plugin-pwa/info" />

declare interface ExtendableEvent extends Event {
  waitUntil(promise: Promise<unknown>): void
}

declare module "pako" {
  export function inflate(data: Uint8Array): Uint8Array
}

declare module "sql.js" {
  export interface QueryExecResult {
    columns: string[]
    values: unknown[][]
  }

  export interface Database {
    exec: (sql: string, params?: unknown[] | Record<string, unknown>) => QueryExecResult[]
    prepare: (sql: string, params?: unknown[] | Record<string, unknown>) => Statement
    export: () => Uint8Array
    getRowsModified: () => number
    close: () => void
  }

  export interface Statement {
    bind: (values?: unknown[] | Record<string, unknown>) => void
    step: () => boolean
    getAsObject: (values?: unknown[] | Record<string, unknown>) => Record<string, unknown>
    run: (values?: unknown[] | Record<string, unknown>) => void
    free: () => void
  }

  export interface SqlJsStatic {
    Database: new (data?: Uint8Array) => Database
  }

  export default function initSqlJs(config?: { locateFile?: (file: string) => string }): Promise<SqlJsStatic>
}
