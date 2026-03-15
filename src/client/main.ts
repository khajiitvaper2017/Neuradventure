import { mount } from "svelte"
import "./styles/app.css"
import App from "./App.svelte"
import { registerSW } from "virtual:pwa-register"
import { setPwaNeedRefresh, setPwaOfflineReady } from "./stores/pwa.js"
import { showQuietNotice } from "./stores/ui.js"
import { initEngine } from "./engine/index.js"
import { initRouter } from "./stores/ui.js"
import { ctxLimitDetected, initSettings } from "./stores/settings.js"
import { getCtxLimitCached, initCtxLimit } from "./engine/llm/index.js"

window.addEventListener("error", (e) => {
  console.error("[uncaught]", e.error ?? e.message)
})
window.addEventListener("unhandledrejection", (e) => {
  if (e.reason === null || e.reason === undefined) return
  if (e.reason instanceof Error) {
    console.error("[unhandled promise]", e.reason, e.reason.stack)
    return
  }
  console.error("[unhandled promise]", e.reason)
})

const updateServiceWorker = registerSW({
  onNeedRefresh() {
    setPwaNeedRefresh(updateServiceWorker)
  },
  onOfflineReady() {
    setPwaOfflineReady()
    showQuietNotice("Offline ready")
  },
})

async function bootstrap() {
  try {
    await initEngine()
  } catch (err) {
    console.error("[engine] Failed to initialize local engine", err)
  }

  try {
    await initSettings()
  } catch (err) {
    console.error("[settings] Failed to initialize settings", err)
  }

  try {
    initRouter()
  } catch (err) {
    console.error("[router] Failed to initialize router", err)
  }

  mount(App, { target: document.getElementById("app")! })

  // Detect context length in the background (network-dependent).
  void initCtxLimit()
    .then(() => ctxLimitDetected.set(getCtxLimitCached()))
    .catch(() => {
      // ignore
    })
}

void bootstrap()

export default {}
