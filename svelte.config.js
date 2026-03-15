import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import adapter from "@sveltejs/adapter-static"

/** @type {import("@sveltejs/kit").Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: "200.html" }),
    alias: {
      "@": "src/lib",
      "@/*": "./src/lib/*",
    },
    serviceWorker: {
      register: false,
    },
  },
}
