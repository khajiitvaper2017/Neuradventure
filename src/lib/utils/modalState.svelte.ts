export function createModal<T>(seed: () => T) {
  let open = $state(false)
  let draft = $state<T>(seed())
  return {
    get open() {
      return open
    },
    get draft() {
      return draft
    },
    set draft(v: T) {
      draft = v
    },
    show(value: T) {
      draft = value
      open = true
    },
    close() {
      open = false
    },
  }
}
