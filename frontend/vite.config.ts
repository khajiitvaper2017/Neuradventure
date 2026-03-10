import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import { consoleForwardPlugin } from "vite-console-forward-plugin"
import { fileURLToPath } from "url"
import { dirname, resolve } from "path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, "..")

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  plugins: [
    consoleForwardPlugin({
      enabled: command === "serve",
      endpoint: "/__console",
    }),
    svelte(),
  ],
  server: {
    host: true,
    fs: {
      allow: [repoRoot],
    },
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
}))
