import { writable } from "svelte/store"

export type Theme = "default" | "amoled"
export type Design = "classic" | "roboto"

function persistedWritable<T>(key: string, initial: T) {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null
  const value = stored !== null ? (JSON.parse(stored) as T) : initial
  const store = writable<T>(value)
  store.subscribe((v) => {
    if (typeof localStorage !== "undefined") localStorage.setItem(key, JSON.stringify(v))
  })
  return store
}

export const theme = persistedWritable<Theme>("nv-theme", "default")
export const design = persistedWritable<Design>("nv-design", "classic")
