import { defineConfig } from "vite"
import { sveltekit } from "@sveltejs/kit/vite"
import { SvelteKitPWA } from "@vite-pwa/sveltekit"
import { fileURLToPath, URL } from "node:url"

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [
    sveltekit(),
    SvelteKitPWA({
      registerType: "prompt",
      includeAssets: ["icons/apple-touch-icon.png"],
      manifest: {
        name: "Neuradventure",
        short_name: "Neuradventure",
        description: "Text-based adventure and chat with local saves.",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#1c1c1c",
        theme_color: "#1c1c1c",
        icons: [
          {
            src: "/icons/pwa-192.png",
            sizes: "192x192",
            type: "image/png",
          },
          {
            src: "/icons/pwa-512.png",
            sizes: "512x512",
            type: "image/png",
          },
          {
            src: "/icons/maskable-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "/icons/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      kit: {
        adapterFallback: "200.html",
      },
      workbox: {
        // Ensure SPA deep-links still boot offline (and include sql.js WASM in precache).
        navigateFallback: "/200.html",
        globPatterns: ["client/**/*.{js,css,ico,png,svg,webp,webmanifest,wasm}", "prerendered/**/*.{html,json}"],
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-stylesheets",
              expiration: { maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-webfonts",
              expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: ({ url }) =>
              url.pathname.includes("/chat/completions") || url.pathname.includes("/completions"),
            handler: "NetworkOnly",
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src/lib", import.meta.url)),
    },
  },
  server: {
    host: "0.0.0.0",
    allowedHosts: true as const,
    forwardConsole: {
      unhandledErrors: true,
      logLevels: ["error", "warn", "info", "log", "debug"],
    },
  },
}))
