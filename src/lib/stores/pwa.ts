import { writable } from "svelte/store"

type UpdateServiceWorkerFn = (reloadPage?: boolean) => Promise<void> | void

export type PwaState = {
  needRefresh: boolean
  offlineReady: boolean
  updateServiceWorker: UpdateServiceWorkerFn | null
}

export const pwa = writable<PwaState>({
  needRefresh: false,
  offlineReady: false,
  updateServiceWorker: null,
})

export function setPwaNeedRefresh(updateServiceWorker: UpdateServiceWorkerFn) {
  pwa.update((s) => ({ ...s, needRefresh: true, updateServiceWorker }))
}

export function clearPwaNeedRefresh() {
  pwa.update((s) => ({ ...s, needRefresh: false, updateServiceWorker: null }))
}

export function setPwaOfflineReady() {
  pwa.update((s) => ({ ...s, offlineReady: true }))
}
