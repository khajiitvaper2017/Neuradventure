# Repository Guidelines

## Project Structure & Module Organization

- `src/routes/`: SvelteKit route shells (`+layout.ts`, `+page.svelte`). Keep these thin.
- `src/lib/`: App code.
  - `engine/`: core runtime (DB/LLM/connectors, game/chat logic).
  - `features/`: feature screens (Game/Chat/Settings/etc.).
  - `components/`: shared UI; shadcn-svelte lives in `components/ui/`.
  - `stores/`, `services/`, `utils/`, `shared/`: state, domain modules, helpers, types/config.
- `src/lib/styles/app.css`: global styles/tokens (most styling is Tailwind classes).
- `static/`: PWA icons and other static assets.
- `scripts/`: local tooling (e.g. `scripts/check-css-imports.ts`).

## Build, Test, and Development Commands

- `npm install`: install dependencies.
- `npm run dev`: run Vite dev server.
- `npm run build`: production build (static SvelteKit + PWA).
- `npm run preview`: serve the production build locally.
- `npm run check`: full CI-style verification (sync, lint, CSS import check, `svelte-check`, TypeScript).
- `npm run lint`: ESLint for `src/` and `scripts/`.
- `npm run format`: Prettier for the repo.
- `npm run generate:pwa-assets`: regenerate PWA assets (when changing icons/manifest assets).

## Coding Style & Naming Conventions

- TypeScript + Svelte 5. Prefer `@/...` imports (alias to `src/lib`, see `svelte.config.js`/`vite.config.ts`).
- Formatting: Prettier (`printWidth: 120`, no semicolons). Run `npm run format` before pushing.
- Linting: ESLint (TypeScript + Svelte). Don’t disable rules unless there’s a clear reason.
- Naming: Svelte components `PascalCase.svelte`; TS values `camelCase`; types `PascalCase`; constants `SCREAMING_SNAKE_CASE`.

## Testing Guidelines

There’s no dedicated unit/integration test runner in this repo yet; treat `npm run check` plus manual smoke-testing (`npm run dev`/`npm run preview`) as the baseline.

## Commit & Pull Request Guidelines

- Commits in history are short and imperative (often lowercase), e.g. `refactor`, `icons`, `bug fix`.
- PRs: include a clear description, screenshots/GIFs for UI changes, and the commands you ran (at minimum `npm run check`).
- Don’t commit generated output or local config: `build/`, `.svelte-kit/`, `node_modules/`, `.env`, or lockfiles (see `.gitignore`).

## Agent-Specific Notes

- Keep logic out of `src/routes/` when possible; put reusable code in `src/lib/`.
- When changing shadcn-svelte components under `src/lib/components/ui/`, prefer minimal edits and regenerate via the `shadcn-svelte` CLI when appropriate.
