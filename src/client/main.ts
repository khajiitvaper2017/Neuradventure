import { mount } from "svelte"
import "./styles/app.css"
import App from "./App.svelte"

window.addEventListener("error", (e) => {
  console.error("[uncaught]", e.error ?? e.message)
})
window.addEventListener("unhandledrejection", (e) => {
  console.error("[unhandled promise]", e.reason)
})

const app = mount(App, {
  target: document.getElementById("app")!,
})

export default app
