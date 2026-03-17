# Repository Guidelines

## Personality

Concise and precise.

## Project Structure & Module Organization

- `src/routes/`: SvelteKit pages/layouts (`+layout.ts`, `+page.svelte`). Keep these thin.
- `src/lib/domain/`: domain logic (currently `domain/story/` for story/game rules + schemas).
- `src/lib/db/`: persistence layer (SQLite/sql.js access + migrations).
- `src/lib/llm/`: LLM connectors + prompting + streaming (see `llm/io/` and `llm/schema/`).
- `src/lib/secrets/`: secret storage/adapters (never log/commit API keys).
- `src/lib/types/`: shared types/models/API payload shapes.
- `src/lib/config/`: shipped config + prompt templates + presets.
- `src/lib/utils/`: low-level helpers (keeps `src/lib/utils.ts` for vendored `@/utils.js` imports).
- `src/lib/features/`: feature screens; `src/lib/components/`: shared UI (`components/ui/` is shadcn-svelte).
- `src/lib/styles/app.css`: Tailwind v4 entry + CSS-variable theme.
- `components.json`: shadcn-svelte CLI config (paths/aliases/theme base color).

## Build, Test, and Development Commands

- `npm install`
- `npm run dev` / `npm run build` / `npm run preview`
- `npm run check` (sync + lint + `svelte-check` + TypeScript)
- `npm run format`, `npm run lint`, `npm run generate:pwa-assets`

## Coding Style, Tooling & Best Practices

- Svelte 5: prefer runes (`$state`, `$derived`, `$effect`) and avoid “legacy mode”; delete/migrate legacy code when touching a file (if safe/scoped).
- Prefer Svelte's native class: directive for purely additive conditions; use cn when utilities conflict.
- Prefer `$derived` over effects; don’t guard effects with `if (browser)`/`typeof window`; use `untrack(() => ...)` for one-time init and `<svelte:window>`/`<svelte:document>` for global listeners when possible.
- UI: Tailwind v4 + shadcn-svelte/Bits UI; add via `npx shadcn-svelte@latest add <component>`; theme via CSS vars in `src/lib/styles/app.css`.
- Secrets: `VITE_*` is client-exposed and stringly-typed; don’t put API keys there. OpenRouter keys must never be logged/committed.
- Tooling/conventions: Prettier + ESLint, `@/...` imports, `PascalCase.svelte`, TS `camelCase`, constants `SCREAMING_SNAKE_CASE`.

## Testing Guidelines

- No unit/integration test runner yet; use `npm run check` plus manual smoke-testing (`npm run dev`/`npm run preview`).

## Commit & Pull Request Guidelines

- Commits are short/imperative (often lowercase). PRs include a description + screenshots for UI changes + `npm run check` results.
- Don’t commit generated output or local config: `build/`, `.svelte-kit/`, `node_modules/`, `.env`, or lockfiles (see `.gitignore`).

## Agent-Specific Notes

- Treat `src/lib/components/ui/` as vendored code: prefer regenerating via shadcn-svelte over manual edits.
- Prefer using existing `src/lib/components/ui/` building blocks before creating new UI components, especially the `*group*` ones for grouped controls.
- Current `src/lib/components/ui/` inventory:
  - `alert-dialog`
  - `avatar`
  - `badge`
  - `button`
  - `card`
  - `checkbox`
  - `dialog`
  - `dropdown-menu`
  - `empty`
  - `field`
  - `input`
  - `input-group` (group)
  - `label`
  - `resizable`
  - `scroll-area`
  - `select`
  - `separator`
  - `sheet`
  - `sonner`
  - `switch`
  - `tabs`
  - `textarea`
  - `toggle`
  - `toggle-group` (group)
- Don’t “helpfully” restore deleted files/folders (e.g. `scripts/`) unless explicitly asked.
- When some files “unexpectedly” dissapeared or got commited, assume it's user and don't undo his edits, adapt to them.
- DON'T UNDO CHANGES THAT OTHER agent OR ME MADE. ADAPT OR IGNORE.

## MCP & Skills (When Relevant)

- Svelte edits: use `svelte-code-writer` + `svelte-core-bestpractices` and run `npx -y @sveltejs/mcp svelte-autofixer <path>`.
- Svelte docs: `npx @sveltejs/mcp list-sections` + `npx @sveltejs/mcp get-documentation "<sections>"`.
- shadcn-svelte: use `mcp__shadcn_svelte__shadcnSvelteGetTool`/`...SearchTool`/`...ListTool` (and the icons tool) before rolling your own.
- OpenAI API: use `openai-docs` + `mcp__openaiDeveloperDocs__search_openai_docs`/`...fetch_openai_doc` for official, up-to-date guidance.
