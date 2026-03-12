import { dirname, resolve, join } from "node:path"
import { fileURLToPath } from "node:url"

const serverDir = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(serverDir, "../../..")

export const LOG_DIR = join(repoRoot, "data", "logs")
