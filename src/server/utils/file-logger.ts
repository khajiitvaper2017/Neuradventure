import { createWriteStream } from "node:fs"
import { mkdirSync } from "node:fs"
import { join } from "node:path"
import { format } from "node:util"
import { LOG_DIR } from "./log-paths.js"

let initialized = false
let stream: ReturnType<typeof createWriteStream> | null = null

export function initFileLogger(): void {
  if (initialized) return
  mkdirSync(LOG_DIR, { recursive: true })
  const serverLogPath = join(LOG_DIR, "server.log")
  stream = createWriteStream(serverLogPath, { flags: "a" })

  const writeLine = (level: string, args: unknown[]) => {
    const line = `${new Date().toISOString()} [${level}] ${format(...args)}\n`
    stream?.write(line)
  }

  const original = {
    log: console.log,
    info: console.info,
    warn: console.warn,
    error: console.error,
  }

  console.log = (...args: unknown[]) => {
    original.log(...args)
    writeLine("info", args)
  }

  console.info = (...args: unknown[]) => {
    original.info(...args)
    writeLine("info", args)
  }

  console.warn = (...args: unknown[]) => {
    original.warn(...args)
    writeLine("warn", args)
  }

  console.error = (...args: unknown[]) => {
    original.error(...args)
    writeLine("error", args)
  }

  initialized = true
}
