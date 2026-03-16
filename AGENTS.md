# AGENTS.md

## Project Overview

A **static, installable SvelteKit PWA** with no custom backend. Navigation is query-param routed (e.g. `/game?story=<id>`, `/chat?chat=<id>`).

---

## Architecture

| Layer         | Technology                                                                                |
| ------------- | ----------------------------------------------------------------------------------------- |
| Frontend      | Svelte 5 + SvelteKit (SSR disabled, `adapter-static`)                                     |
| Persistence   | `sql.js` (WASM SQLite) → IndexedDB via `navigator.storage.persist()`                      |
| LLM           | Browser `fetch` → OpenAI-compatible APIs (OpenRouter, LAN KoboldCpp)                      |
| Streaming     | In-process streaming hub — no WebSocket server                                            |
| PWA / Offline | `@vite-pwa/sveltekit` (Workbox) — precaches assets + WASM; network-only for LLM endpoints |

---

## Project Structure

```
src/
├── routes/             # Thin SvelteKit route shells — logic lives in src/lib
├── app.html            # HTML template
├── app.d.ts            # App-wide TypeScript declarations
└── lib/
    ├── engine/         # Browser-only: sql.js, IndexedDB, game logic, LLM connectors
    ├── services/       # Domain modules: stories, turns, chats, settings, generate, stream
    ├── stores/         # Svelte stores: UI state, settings, game/chat state, PWA state
    ├── features/       # Feature screens: Home, Game, Chat, Settings
    ├── components/     # Shared UI: controls/, inputs/, overlays/, panels/, rich/, icons/
    ├── styles/         # Global CSS and tokens (app.css) — avoid component-scoped <style>
    └── shared/         # Types and configurations

static/                 # PWA icons and static assets
scripts/                # Local tooling (lint/check helpers)
vite.config.ts
svelte.config.js        # adapter-static, aliases, Service Worker settings
```

**Import alias:** Always use `@/` for internal imports (aliases to `src/lib`).

---

## Development Workflow

- **Batch edits** — group related changes; use scripts for bulk refactoring.
- **Plan revisions** — base revised plans on prior ones unless fundamentally incompatible.
- **Dependencies** — propose new libraries when they meaningfully simplify code; remove any unused packages.
- **After major edits:** run `npm run lint` and `npm run check`.
- **End of workflow:** always run `npm run format`. Don't restore or checkout any affected by format files that you didn't change. Just ignore.
- **Linting gaps** — if an error bypasses current checks, update linting config to catch it going forward.

---

## Code Standards

- Use the newest stable APIs and patterns. Rewrite modules from scratch when it materially improves simplicity.
- **Never write legacy or deprecated code.** Never leave it in place. No exceptions — not for compatibility, not for "shims", not for convenience.
- If asked to remove something, remove it completely in the simplest way.

---

## UI & Styling

- **Primitives** — use shadcn-style components (`src/lib/components/ui/**`, Tailwind + Bits UI). Never write or reintroduce legacy widgets under any circumstances.
- **Raw HTML elements** — never use `<button>`, `<label>`, `<select>`, `<textarea>` etc. outside `ui/**`. Use their capitalized equivalents (`Button`, `Label`, etc.).
- **Design tokens** — accent color defaults to `#c85c5c` (user-configurable), drives `--primary` and `--ring`. Use `font-story` (Spectral) for story logs and narrative text. See `DESIGN.md` for full rules.
- **Component files** — extract new UI components into separate files; keep files under ~1000 lines.

---

## Svelte 5 Best Practices

- **CSR-only** — SSR is disabled. Guard browser APIs (`window`, `document`, `navigator`) where needed.
- **Routing** — keep `src/routes/**` thin; offload logic to `src/lib/**`.
- **Head** — use `<svelte:head>` for per-route `<title>` and metadata. Do not hardcode `<link rel="manifest">` — it is injected by `virtual:pwa-info`.
- **Slots** — use snippets (`{#snippet …}` / `{@render …}`) instead of legacy `<slot>` / `$$slots`.
- **Lists** — use keyed `{#each}` blocks for dynamic lists: `(item.id)`.
- **Global listeners** — prefer `<svelte:window>` or `<svelte:document>`. If using `addEventListener` manually in actions or `onMount`, always provide cleanup.
- **Accessibility** — every interactive control needs a clear label (`aria-label`, visible text, or `<label for="…">`). Use semantic roles; preserve focus and navigation during route changes and modal triggers.

---

## File & Agent Management

- **Scope** — only modify files explicitly in your plan. Ignore unrelated `git status` changes.
- **Multi-agent** — other agents may be working simultaneously. Do not delete unassigned files. If your edits revert unexpectedly and you are certain it was caused by another agent (not the user), merge your changes with the current file state rather than overwriting. When in doubt, stop and ask before making any changes.
- **Cleanup** — delete empty directories when they are no longer needed.

---

## Constraints

**GBNF patterns** — all regex patterns in JSON-to-GBNF conversions must explicitly begin with `^` and end with `$`.
