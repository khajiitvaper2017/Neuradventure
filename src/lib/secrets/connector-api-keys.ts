import { openDB, type IDBPDatabase } from "idb"
import { getDb } from "@/db/connection"
import { HIDDEN_SECRET_PLACEHOLDER } from "@/secrets"

export type ConnectorApiKeyType = "koboldcpp" | "openrouter"

type SecretsSchema = {
  kv: {
    key: string
    value: unknown
  }
}

type EncryptedSecretV1 = {
  v: 1
  iv: Uint8Array
  ct: Uint8Array
}

type PlainSecretV0 = {
  v: 0
  plaintext: string
}

type StoredSecret = EncryptedSecretV1 | PlainSecretV0

type MasterKeyCryptokey = { kind: "cryptokey"; key: CryptoKey }
type MasterKeyRaw = { kind: "raw"; raw: Uint8Array | ArrayBuffer }
type StoredMasterKey = MasterKeyCryptokey | MasterKeyRaw

const SECRETS_DB_NAME = "neuradventure_secrets_v1"
const SECRETS_STORE = "kv"
const MASTER_KEY_ID = "master_key"

const secretIdFor = (type: ConnectorApiKeyType) => `connector_api_key:${type}`

let secretsDb: IDBPDatabase<SecretsSchema> | null = null
let masterKey: CryptoKey | null = null

let initPromise: Promise<void> | null = null
let initStatus: "uninitialized" | "ready" | "failed" = "uninitialized"

const cachedSecrets: Partial<Record<ConnectorApiKeyType, string>> = {}
const cachedPresence: Partial<Record<ConnectorApiKeyType, boolean>> = {}

function canUseWebCrypto(): boolean {
  return typeof crypto !== "undefined" && !!crypto.subtle && typeof crypto.subtle.encrypt === "function"
}

async function getSecretsDb(): Promise<IDBPDatabase<SecretsSchema>> {
  if (secretsDb) return secretsDb
  secretsDb = await openDB<SecretsSchema>(SECRETS_DB_NAME, 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(SECRETS_STORE)) db.createObjectStore(SECRETS_STORE)
    },
  })
  return secretsDb
}

async function loadOrCreateMasterKey(db: IDBPDatabase<SecretsSchema>): Promise<CryptoKey | null> {
  if (!canUseWebCrypto()) return null

  const stored = (await db.get(SECRETS_STORE, MASTER_KEY_ID)) as StoredMasterKey | undefined
  if (stored?.kind === "cryptokey" && stored.key) return stored.key
  if (stored?.kind === "raw" && stored.raw) {
    const raw =
      stored.raw instanceof ArrayBuffer
        ? new Uint8Array(stored.raw)
        : stored.raw instanceof Uint8Array
          ? new Uint8Array(stored.raw)
          : null
    if (!raw) return null
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])
  }

  try {
    const generated = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"])
    await db.put(SECRETS_STORE, { kind: "cryptokey", key: generated } satisfies MasterKeyCryptokey, MASTER_KEY_ID)
    return generated
  } catch {
    const extractable = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])
    const raw = new Uint8Array(await crypto.subtle.exportKey("raw", extractable))
    await db.put(SECRETS_STORE, { kind: "raw", raw } satisfies MasterKeyRaw, MASTER_KEY_ID)
    return crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"])
  }
}

async function encryptSecret(key: string, mk: CryptoKey): Promise<EncryptedSecretV1> {
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const pt = new TextEncoder().encode(key)
  const ctBuf = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, mk, pt)
  return { v: 1, iv, ct: new Uint8Array(ctBuf) }
}

async function decryptSecret(payload: EncryptedSecretV1, mk: CryptoKey): Promise<string | null> {
  try {
    const iv = new Uint8Array(payload.iv)
    const ct = new Uint8Array(payload.ct)
    const ptBuf = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, mk, ct)
    const text = new TextDecoder().decode(ptBuf)
    const trimmed = text.trim()
    return trimmed ? trimmed : ""
  } catch {
    return null
  }
}

async function readSecret(type: ConnectorApiKeyType): Promise<string | null> {
  const db = await getSecretsDb()
  const stored = (await db.get(SECRETS_STORE, secretIdFor(type))) as StoredSecret | undefined
  if (!stored) return null
  if (stored.v === 0) return typeof stored.plaintext === "string" ? stored.plaintext : null
  if (stored.v === 1) {
    if (!masterKey) return null
    return decryptSecret(stored, masterKey)
  }
  return null
}

async function writeSecret(type: ConnectorApiKeyType, value: string, opts?: { keepEmpty?: boolean }): Promise<void> {
  const db = await getSecretsDb()
  const trimmed = value.trim()
  if (!trimmed) {
    if (opts?.keepEmpty) {
      await db.put(SECRETS_STORE, { v: 0, plaintext: "" } satisfies PlainSecretV0, secretIdFor(type))
      cachedPresence[type] = true
      cachedSecrets[type] = ""
    } else {
      await db.delete(SECRETS_STORE, secretIdFor(type))
      cachedPresence[type] = false
      cachedSecrets[type] = ""
    }
    return
  }

  if (masterKey && canUseWebCrypto()) {
    const encrypted = await encryptSecret(trimmed, masterKey)
    await db.put(SECRETS_STORE, encrypted, secretIdFor(type))
  } else {
    await db.put(SECRETS_STORE, { v: 0, plaintext: trimmed } satisfies PlainSecretV0, secretIdFor(type))
  }

  cachedPresence[type] = true
  cachedSecrets[type] = trimmed
}

function scrubSettingsConnectorSecrets(settings: unknown): unknown {
  if (!settings || typeof settings !== "object") return settings
  const root = settings as Record<string, unknown>
  const connectorRaw = root.connector
  if (!connectorRaw || typeof connectorRaw !== "object") return settings
  const connector = connectorRaw as Record<string, unknown>

  const apiKeysRaw = connector.api_keys
  const apiKeys =
    apiKeysRaw && typeof apiKeysRaw === "object" && !Array.isArray(apiKeysRaw)
      ? (apiKeysRaw as Record<string, unknown>)
      : {}

  apiKeys.koboldcpp = "kobold"
  apiKeys.openrouter = ""
  connector.api_keys = apiKeys

  root.connector = connector
  return root
}

async function migrateSecretsOutOfSettingsDb(): Promise<void> {
  const row = getDb().prepare("SELECT settings_json FROM settings WHERE id = 1").get() as
    | { settings_json: string }
    | undefined
  if (!row?.settings_json) return

  let parsed: unknown
  try {
    parsed = JSON.parse(row.settings_json) as unknown
  } catch {
    return
  }

  if (!parsed || typeof parsed !== "object") return
  const root = parsed as Record<string, unknown>
  const connector = root.connector
  if (!connector || typeof connector !== "object") return
  const conn = connector as Record<string, unknown>

  const apiKeysRaw = conn.api_keys
  const apiKeys =
    apiKeysRaw && typeof apiKeysRaw === "object" && !Array.isArray(apiKeysRaw)
      ? (apiKeysRaw as Record<string, unknown>)
      : null

  const koboldcpp = apiKeys && typeof apiKeys.koboldcpp === "string" ? apiKeys.koboldcpp : null
  const openrouter = apiKeys && typeof apiKeys.openrouter === "string" ? apiKeys.openrouter : null

  const toWrite: Array<[ConnectorApiKeyType, string]> = []
  if (apiKeys && typeof apiKeys.koboldcpp === "string" && koboldcpp !== null && koboldcpp.trim() === "") {
    if (!hasCachedConnectorApiKey("koboldcpp")) toWrite.push(["koboldcpp", ""])
  }
  if (
    koboldcpp &&
    koboldcpp.trim() &&
    koboldcpp.trim() !== HIDDEN_SECRET_PLACEHOLDER &&
    !hasCachedConnectorApiKey("koboldcpp")
  ) {
    toWrite.push(["koboldcpp", koboldcpp])
  }
  if (
    openrouter &&
    openrouter.trim() &&
    openrouter.trim() !== HIDDEN_SECRET_PLACEHOLDER &&
    !hasCachedConnectorApiKey("openrouter")
  ) {
    toWrite.push(["openrouter", openrouter])
  }

  if (toWrite.length === 0) {
    const scrubbed = scrubSettingsConnectorSecrets(parsed)
    if (JSON.stringify(scrubbed) !== row.settings_json) {
      getDb()
        .prepare("UPDATE settings SET settings_json = ?, updated_at = datetime('now') WHERE id = 1")
        .run(JSON.stringify(scrubbed))
    }
    return
  }

  for (const [k, v] of toWrite) {
    await writeSecret(k, v)
  }

  const scrubbed = scrubSettingsConnectorSecrets(parsed)
  getDb()
    .prepare("UPDATE settings SET settings_json = ?, updated_at = datetime('now') WHERE id = 1")
    .run(JSON.stringify(scrubbed))
}

export async function initConnectorApiKeySecrets(): Promise<void> {
  if (initStatus === "ready" || initStatus === "failed") return
  if (initPromise) return initPromise
  initPromise = (async () => {
    const db = await getSecretsDb()
    masterKey = await loadOrCreateMasterKey(db)

    const kobold = await readSecret("koboldcpp")
    cachedPresence.koboldcpp = kobold !== null
    if (kobold !== null) cachedSecrets.koboldcpp = kobold

    const openrouter = await readSecret("openrouter")
    cachedPresence.openrouter = openrouter !== null && !!openrouter
    if (openrouter) cachedSecrets.openrouter = openrouter

    await migrateSecretsOutOfSettingsDb()

    if (!hasCachedConnectorApiKey("koboldcpp")) {
      await writeSecret("koboldcpp", "kobold", { keepEmpty: true })
    }
    initStatus = "ready"
  })().catch((err) => {
    initStatus = "failed"
    console.warn("[secrets] Failed to initialize connector API key storage; falling back to plaintext settings.", err)
  })
  return initPromise
}

export function areConnectorSecretsReady(): boolean {
  return initStatus === "ready"
}

export function hasCachedConnectorApiKey(type: ConnectorApiKeyType): boolean {
  return cachedPresence[type] === true
}

export function getCachedConnectorApiKey(type: ConnectorApiKeyType): string | null {
  if (!hasCachedConnectorApiKey(type)) return null
  return typeof cachedSecrets[type] === "string" ? String(cachedSecrets[type]) : ""
}

export async function setConnectorApiKey(type: ConnectorApiKeyType, value: string): Promise<void> {
  await initConnectorApiKeySecrets()
  if (!areConnectorSecretsReady()) throw new Error("Secret storage unavailable")
  await writeSecret(type, value, { keepEmpty: type === "koboldcpp" })
}

export async function clearConnectorApiKey(type: ConnectorApiKeyType): Promise<void> {
  await initConnectorApiKeySecrets()
  if (!areConnectorSecretsReady()) throw new Error("Secret storage unavailable")
  await writeSecret(type, "", { keepEmpty: false })
}
