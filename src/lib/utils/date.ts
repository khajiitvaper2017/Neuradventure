export function utcDateMs(dateStr: string): number {
  const normalized = dateStr.endsWith("Z") ? dateStr : `${dateStr}Z`
  return new Date(normalized).getTime()
}

export function relativeTimeAgo(dateStr: string): string {
  const diff = Date.now() - utcDateMs(dateStr)
  const m = Math.floor(diff / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}
