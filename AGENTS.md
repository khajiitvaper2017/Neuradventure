# Repository Guidelines

## Project Structure & Module Organization

- `src/routes/`: SvelteKit pages/layouts (`+layout.ts`, `+page.svelte`). Keep these thin.
- `src/lib/engine/`: core runtime (DB/LLM/connectors, game/chat logic).
- `src/lib/features/`: feature screens; `src/lib/components/`: shared UI (`components/ui/` is shadcn-svelte).
- `src/lib/styles/app.css`: Tailwind v4 entry + CSS-variable theme.
- `components.json`: shadcn-svelte CLI config (paths/aliases/theme base color).
- `static/`: PWA icons and other static assets.
- `scripts/`: local tooling (e.g. `scripts/check-css-imports.ts`).

## Build, Test, and Development Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run check` (sync + lint + CSS import check + `svelte-check` + TypeScript)
- `npm run format`, `npm run lint`, `npm run check:css`
- `npm run generate:pwa-assets`

## Coding Style, Tooling & Best Practices

- Svelte 5: prefer runes (`$state`, `$derived`, `$effect`). Prefer `$derived` over effects; keep side effects in handlers/services.
- Avoid legacy/compat patterns: don’t introduce Svelte 4-era APIs/“legacy mode”. When touching a file, delete/migrate legacy code if it’s safe and scoped.
- Effects: don’t wrap in `if (browser)`/`typeof window` checks; use `untrack(() => ...)` for one-time init that reads reactive values; use `<svelte:window>`/`<svelte:document>` for global listeners when possible.
- UI: Tailwind v4 + shadcn-svelte/Bits UI; add/update via `npx shadcn-svelte@latest add <component>`; theme via CSS vars in `src/lib/styles/app.css`.
- Vite env: use `import.meta.env`; `VITE_*` is public (client-exposed) and always stringly-typed — never put secrets there.
- Tooling: Prettier (no semicolons, `printWidth: 120`) + ESLint; keep changes `npm run check` clean.
- Code quality: prefer small, typed modules; avoid `any` and double-casts except at boundaries; don’t swallow errors silently.
- Conventions: `@/...` imports; components `PascalCase.svelte`; TS `camelCase`; constants `SCREAMING_SNAKE_CASE`.

## Testing Guidelines

There’s no dedicated unit/integration test runner in this repo yet; treat `npm run check` plus manual smoke-testing (`npm run dev`/`npm run preview`) as the baseline.

## Security & Configuration Tips

- OpenRouter: use `Authorization: Bearer ...`; keep metadata headers (`HTTP-Referer`, `X-OpenRouter-Title`) when present; never log/commit keys.

## Commit & Pull Request Guidelines

- Commits in history are short and imperative (often lowercase), e.g. `refactor`, `icons`, `bug fix`.
- PRs: include a clear description, screenshots/GIFs for UI changes, and the commands you ran (at minimum `npm run check`).
- Don’t commit generated output or local config: `build/`, `.svelte-kit/`, `node_modules/`, `.env`, or lockfiles (see `.gitignore`).

## Agent-Specific Notes

- Treat `src/lib/components/ui/` as vendored code: prefer regenerating via shadcn-svelte over manual edits.
