export function isNearBottom(el: HTMLElement | null | undefined, thresholdPx = 96): boolean {
  if (!el) return true
  const remaining = el.scrollHeight - el.scrollTop - el.clientHeight
  return remaining <= thresholdPx
}
