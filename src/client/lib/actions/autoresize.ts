export function autoresize(node: HTMLTextAreaElement) {
  const resize = () => {
    node.style.height = "0px"
    node.style.height = `${node.scrollHeight}px`
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
    update() {
      schedule()
    },
    destroy() {
      node.removeEventListener("input", schedule)
      window.removeEventListener("resize", schedule)
      observer?.disconnect()
    },
  }
}
