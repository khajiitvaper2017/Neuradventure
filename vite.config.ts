import { defineConfig } from "vite"
import { svelte } from "@sveltejs/vite-plugin-svelte"

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [svelte()],
  resolve: {
    tsconfigPaths: true,
  },
  server: {
    host: true,
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ["error", "warn", "info", "log", "debug"],
    },
    ...(process.env.NA_VITE_MIDDLEWARE === "1"
      ? {}
      : {
          proxy: {
            "/api": {
              target: "http://localhost:3001",
              changeOrigin: true,
              ws: true,
            },
          },
        }),
  },
}))
