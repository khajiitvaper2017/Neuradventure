export function scrollToBottom(el: HTMLElement | null, options: { smooth?: boolean } = {}) {
  if (!el) return
  if (options.smooth) {
    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" })
  } else {
    el.scrollTop = el.scrollHeight
  }
}
