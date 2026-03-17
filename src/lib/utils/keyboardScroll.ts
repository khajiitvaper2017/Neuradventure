export function scheduleKeyboardScroll(
  timerRef: { id: number | null },
  scrollToBottom: () => void,
  delayMs: number,
) {
  if (timerRef.id) window.clearTimeout(timerRef.id)
  requestAnimationFrame(() => scrollToBottom())
  timerRef.id = window.setTimeout(() => scrollToBottom(), delayMs)
}

