export type StoragePersistenceStatus = { supported: false } | { supported: true; persisted: boolean; granted: boolean }

export async function ensurePersistentStorage(): Promise<StoragePersistenceStatus> {
  if (typeof navigator === "undefined") return { supported: false }
  const storage = navigator.storage
  if (!storage?.persist || !storage.persisted) return { supported: false }

  const persisted = await storage.persisted()
  if (persisted) return { supported: true, persisted: true, granted: true }

  const granted = await storage.persist()
  return { supported: true, persisted: granted, granted }
}
