# src/ Guidelines

- This is a client-rendered SvelteKit app: `src/routes/+layout.ts` sets `ssr = false` and `prerender = true`.
- Keep routing files thin and push reusable logic into `src/lib/`.
- Prefer `@/...` imports (alias to `src/lib`).
- Don’t introduce legacy/compat code (Svelte 4-era patterns); when editing a file, remove/migrate legacy code if it’s safe and scoped.

