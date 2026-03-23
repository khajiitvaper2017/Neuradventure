export { normalizeGender } from "@/utils/text/normalize"

export type GenderIcon = "male" | "female" | "intersex" | "transgender" | null

export function genderIcon(gender: string | undefined): GenderIcon {
  if (!gender) return null
  const raw = gender.trim().toLowerCase()
  if (!raw) return null
  if (raw.includes("⚥")) return "intersex"
  if (raw.includes("⚧")) return "transgender"

  const cleaned = raw.replace(/[^a-z0-9]+/g, " ").trim()
  const compact = cleaned.replace(/\s+/g, "")
  const tokens = cleaned.split(/\s+/).filter(Boolean)

  if (compact.includes("intersex")) {
    return "intersex"
  }

  if (compact.includes("transgender") || compact.includes("transwoman") || compact.includes("transman")) {
    return "transgender"
  }

  if (raw.includes("female")) return "female"
  if (raw.includes("male")) return "male"
  if (tokens.includes("woman") || tokens.includes("girl") || tokens.includes("f")) return "female"
  if (tokens.includes("man") || tokens.includes("boy") || tokens.includes("m")) return "male"
  return null
}

export function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
