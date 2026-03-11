import { readFileSync } from "fs"
import { dirname, join } from "path"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

export const npcTraits: string[] = JSON.parse(readFileSync(join(__dirname, "../../../shared/traits.json"), "utf-8"))
export const npcTraitEnumValues = npcTraits.map((trait) => trait.trim()).filter((trait) => trait.length > 0)
export const npcTraitLookup = new Map(npcTraitEnumValues.map((trait) => [trait.toLowerCase(), trait]))
