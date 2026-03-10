import tsPlugin from "@typescript-eslint/eslint-plugin"
import tsParser from "@typescript-eslint/parser"
import sveltePlugin from "eslint-plugin-svelte"
import svelteParser from "svelte-eslint-parser"
import baseSvelteConfig from "./svelte.config.js"

const svelteConfig = {
  ...baseSvelteConfig,
  onwarn(warning, handler) {
    if (warning?.code === "css_unused_selector") return
    handler(warning)
  },
}

export default [
  {
    files: ["src/**/*.ts"],
    languageOptions: {
      parser: tsParser,
    },
    plugins: {
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      "@typescript-eslint/no-unused-vars": "error",
      "@typescript-eslint/explicit-function-return-type": "off",
    },
  },
  {
    files: ["src/client/**/*.svelte"],
    languageOptions: {
      parser: svelteParser,
      parserOptions: {
        parser: tsParser,
        svelteConfig,
      },
    },
    plugins: {
      svelte: sveltePlugin,
      "@typescript-eslint": tsPlugin,
    },
    rules: {
      ...sveltePlugin.configs.recommended.rules,
    },
  },
]
