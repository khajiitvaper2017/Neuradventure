import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import type { Plugin } from "vite"

function consoleForwardPlugin(): Plugin {
  return {
    name: "console-forward",
    configureServer(server) {
      server.middlewares.use("/__console", (req, res) => {
        if (req.method !== "POST") { res.statusCode = 405; res.end(); return }
        let body = ""
        req.on("data", (chunk) => { body += chunk })
        req.on("end", () => {
          try {
            const { level, args } = JSON.parse(body)
            const prefix = level === "error" ? "\x1b[31m[browser error]\x1b[0m"
              : level === "warn" ? "\x1b[33m[browser warn]\x1b[0m"
              : "\x1b[36m[browser log]\x1b[0m"
            console.log(prefix, ...args)
          } catch {}
          res.statusCode = 204; res.end()
        })
      })
    },
    transformIndexHtml() {
      return [{ tag: "script", attrs: { type: "module" }, children: `
        const _fwd = (level) => (...args) => {
          const safe = args.map(a => { try { return typeof a === 'object' ? JSON.stringify(a) : String(a) } catch { return String(a) } })
          fetch('/__console', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ level, args: safe }) })
        }
        const _err = console.error.bind(console)
        const _warn = console.warn.bind(console)
        console.error = (...a) => { _err(...a); _fwd('error')(...a) }
        console.warn  = (...a) => { _warn(...a); _fwd('warn')(...a) }
      `, injectTo: "head-prepend" }]
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [consoleForwardPlugin(), svelte()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
})
