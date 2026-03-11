export function genderIcon(gender: string | undefined): "male" | "female" | null {
  if (!gender) return null
  const g = gender.toLowerCase()
  if (g.includes("female")) return "female"
  if (g.includes("male")) return "male"
  return null
}

export function splitCsv(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0)
}
