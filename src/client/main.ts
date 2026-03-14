import { mount } from "svelte"
import "./styles/app.css"
import App from "./App.svelte"
import { streamClient } from "./api/stream"

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

function kickStreaming() {
  try {
    streamClient.ensureConnected()
  } catch {
    // ignore 
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") kickStreaming()
})
window.addEventListener("pageshow", kickStreaming)
window.addEventListener("focus", kickStreaming)
window.addEventListener("na-resume", kickStreaming as EventListener)

const app = mount(App, {
  target: document.getElementById("app")!,
})

export default app
