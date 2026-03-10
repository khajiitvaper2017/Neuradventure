import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"
import { consoleForwardPlugin } from "vite-console-forward-plugin"

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
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
      },
    },
  },
}))
