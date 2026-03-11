export function autoresize(node: HTMLTextAreaElement, _value?: string) {
  void _value
  const getScrollRoot = () => node.closest<HTMLElement>("[data-scroll-root]")

  const resize = () => {
    const root = getScrollRoot()
    const prevScrollTop = root?.scrollTop ?? 0
    const prevScrollLeft = root?.scrollLeft ?? 0
    const isActive = document.activeElement === node

    node.style.height = "auto"
    node.style.height = `${node.scrollHeight}px`

    if (root && isActive) {
      root.scrollTop = prevScrollTop
      root.scrollLeft = prevScrollLeft
    }
  }

  const schedule = () => requestAnimationFrame(resize)

  schedule()
  node.addEventListener("input", schedule)
  window.addEventListener("resize", schedule)

  let observer: ResizeObserver | null = null
  if (typeof ResizeObserver !== "undefined") {
    observer = new ResizeObserver(() => schedule())
    observer.observe(node)
  }

  return {
    update(_nextValue?: string) {
      void _nextValue
      schedule()
    },
    destroy() {
      node.removeEventListener("input", schedule)
      window.removeEventListener("resize", schedule)
      observer?.disconnect()
    },
  }
}
