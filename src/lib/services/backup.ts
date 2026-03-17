import { exportDbBytes, flushDb, restoreDbBytes } from "@/db/connection"
import { downloadText } from "@/utils/downloadText"

type NeuradventureBackupV1 = {
  v: 1
  kind: "neuradventure-backup"
  created_at: string
  origin?: string
  db_base64: string
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ""
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const bin = atob(base64)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return bytes
}

function fileTimestamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(
    d.getMinutes(),
  )}-${pad(d.getSeconds())}`
}

function parseBackup(text: string): NeuradventureBackupV1 {
  let parsed: unknown
  try {
    parsed = JSON.parse(text) as unknown
  } catch {
    throw new Error("Invalid backup file (not JSON)")
  }

  if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup file")
  const obj = parsed as Record<string, unknown>
  if (obj.v !== 1) throw new Error("Unsupported backup version")
  if (obj.kind !== "neuradventure-backup") throw new Error("Invalid backup file type")
  if (typeof obj.created_at !== "string") throw new Error("Invalid backup file (missing created_at)")
  if (typeof obj.db_base64 !== "string" || !obj.db_base64.trim()) throw new Error("Invalid backup file (missing db)")

  const origin = typeof obj.origin === "string" ? obj.origin : undefined
  return {
    v: 1,
    kind: "neuradventure-backup",
    created_at: obj.created_at,
    origin,
    db_base64: obj.db_base64,
  }
}

export const backup = {
  exportAllAndDownload: async (): Promise<void> => {
    await flushDb()
    const bytes = exportDbBytes()

    const payload: NeuradventureBackupV1 = {
      v: 1,
      kind: "neuradventure-backup",
      created_at: new Date().toISOString(),
      origin: typeof location !== "undefined" ? location.origin : undefined,
      db_base64: bytesToBase64(bytes),
    }

    const filename = `neuradventure-backup_${fileTimestamp(new Date())}.ndbackup`
    downloadText(filename, JSON.stringify(payload), "application/json")
  },

  restoreAllFromFile: async (file: File): Promise<void> => {
    const text = await file.text()
    const parsed = parseBackup(text)
    const bytes = base64ToBytes(parsed.db_base64)
    await restoreDbBytes(bytes)
  },
}
