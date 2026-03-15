import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import adapter from "@sveltejs/adapter-static"

/** @type {import("@sveltejs/kit").Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({ fallback: "index.html" }),
    alias: {
      "@": "src/lib",
    },
    serviceWorker: {
      register: false,
    },
  },
}
