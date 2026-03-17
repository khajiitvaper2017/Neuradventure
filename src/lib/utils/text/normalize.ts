function uppercaseFirstAlpha(value: string): string {
  const match = /[A-Za-z]/.exec(value)
  if (!match || match.index === undefined) return value
  const index = match.index
  return value.slice(0, index) + value[index].toUpperCase() + value.slice(index + 1)
}

function normalizeGenderValue(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return ""
  const lower = trimmed.toLowerCase()
  if (lower === "m" || lower === "male") return "Male"
  if (lower === "f" || lower === "female") return "Female"
  return uppercaseFirstAlpha(trimmed)
}

export function normalizeGender(value: unknown, fallback = ""): string {
  const primary = typeof value === "string" ? value : ""
  const normalized = normalizeGenderValue(primary)
  if (normalized) return normalized
  return normalizeGenderValue(fallback)
}
