import { vitePreprocess } from "@sveltejs/vite-plugin-svelte"
import adapter from "@sveltejs/adapter-static"

/** @type {import("@sveltejs/kit").Config} */
export default {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      precompress: true,
    }),
    paths: {
      relative: false,
    },
    alias: {
      "@": "src/lib",
      "@/*": "./src/lib/*",
    },
    serviceWorker: {
      register: false,
    },
    prerender: {
      entries: ["*"],
      crawl: true,
      handleHttpError: "warn",
    },
    inlineStyleThreshold: 1024,
    output: {
      bundleStrategy: "split",
    },
  },
}
