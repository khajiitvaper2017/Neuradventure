import { mount } from "svelte"
import "./styles/app.css"
import App from "./App.svelte"

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

const app = mount(App, {
  target: document.getElementById("app")!,
})

export default app
