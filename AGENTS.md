# AGENTS.md
## AI Coding Guidelines
- **Execution**: NEVER run `npm run dev` by yourself.
- **Planning revisions**: If the user rejects your plan, base the new plan on the previous one (unless they are incompatible). Always remember and reference prior plans when proposing updates.
- **Significant code changes**: After any major edits, always run `npm run lint`, `npm run check`. Plan changes in a way that allows to minimize amount of tool calls and checks. Try doing changes in a batches using scripts if a lot of files need to be refactored or moved. In the end of the work run `npm run format`. Prioritize removing legacy code. Remove shims when possible and try to not use them. Use newest techonologies if possible, never use deprecated code. Never leave unused packages. Don't hesitate rewrite something from scratch if it will greatly simplify and improve code.
- **Git & version control**: Ignore git entirely unless explicitly asked. **Never** modify `endOfLine` settings in any config files.
- **Git status**: Only address files you have actually edited. Ignore any other files shown in `git status`.
- **Styling & CSS**: Ensure all changes align with the application's existing design system. Never use temporary/stopgap solutions. For shared styles, use or extend `shared.css` (add new common classes there when needed). Use Minimalist / Refined archetype and `DESIGN.md` when creating or changing CSS.
- **File management**: Never delete any file unless it was part of your original plan. Assume other AI agents may be working on the codebase simultaneously. If a file you edited reverts to its old state, restore your version and continue — do not waste time investigating why. I will handle the other agent.
- **Component structure**: Whenever possible, extract new UI components into separate files. Files exceeding ~1000 lines of code are not acceptable.
- **Linting & checks**: If an error slips through linting or checks, update the lint rules or configuration to catch it going forward.
- **Package files**: Never generate or modify `package-lock.json`.
- **Output format**: Always use clean Markdown for plans, explanations, code blocks, and any written response.
- **Additional dependencies**: Feel free to propose any libraries that could help greatly reduce code and improve maintainability.
## GBNF Pattern Constraint
- JSON-to-GBNF conversion requires regex patterns to start with `^` and end with `$`.
## Project Structure
This repo is a **static, installable SvelteKit PWA** (no custom backend).
Update the structure here if changed.
- `src/routes/**` - SvelteKit routes (thin shells only)
- Query-param routing is the source of truth:
- `/game?story=<id>`
- `/chat?chat=<id>`
- `src/lib/**` - all application code
- `src/lib/engine/**` - browser-only engine (sql.js + IndexedDB persistence, game logic, LLM connectors)
- `src/lib/services/**` - domain modules (stories/turns/chats/settings/generate/stream, etc.)
- `src/lib/stores/**` - Svelte stores (UI state, settings, game/chat state, PWA state)
- `src/lib/features/**` - feature screens (Home/Game/Chat/Settings, etc.)
- `src/lib/components/**` - shared UI components
- `controls/`, `inputs/`, `overlays/`, `panels/`, `rich/`, `icons/`
- `src/lib/styles/**` - global CSS (`app.css` imports `shared.css`)
- `src/lib/shared/**` - configs/types previously under `shared/**`
- `src/app.html` - HTML template (SvelteKit replaces the old root `index.html`)
- `src/app.d.ts` - app-wide TS declarations
- `static/**` - static assets (PWA icons, etc.)
- `scripts/**` - local tooling scripts (lint/check helpers)
- `vite.config.ts` - Vite + PWA config
- `svelte.config.js` - SvelteKit config (adapter-static, aliases, SW settings)
## Import Rules
- Use `@/…` for internal imports (alias to `src/lib` via `kit.alias` + Vite alias).
## SvelteKit & Svelte Best Practices (Project-Specific)
Follow the upstream docs unless a user request overrides them:
- **Routes stay thin**: keep `src/routes/**` as page shells; put logic in `src/lib/**`.
- **CSR-only**: this app disables SSR; avoid server-only assumptions and guard browser APIs (`window`, `document`, `navigator`) when needed.
- **Head management**:
- Use `<svelte:head>` for per-route `<title>` and other metadata.
- PWA manifest link is injected at runtime via `virtual:pwa-info` (don’t hardcode a manifest `<link>` in `src/app.html`).
- **Components**:
- Prefer Svelte 5 **snippets** (`{#snippet ...}{/snippet}` + `{@render ...}`) over legacy `<slot>`/`$$slots`.
- Prefer **keyed** `{#each}` blocks for dynamic lists (`(item.id)` or another stable key).
- **Events and cleanup**:
- Prefer `<svelte:window>` / `<svelte:document>` for global events when practical.
- Always clean up any manual `addEventListener` in `onMount`/actions.
- **Accessibility**:
- Ensure every interactive control has a clear label (`aria-label`, visible text, or `<label for=...>`).
- Don’t break focus/navigation when changing routes or showing modals; use semantic roles/attributes.
## References
Check this when asked to. Don't modify.
`.references_source_code/json-schema` - json-schema guidelines.
`.references_source_code/zod` - zod that builds upon json-schema.
`.references_source_code/koboldcpp` - KoboldCpp source; Adventure/Chat modes and LLM endpoint behavior.
`.references_source_code/SillyTavern` - SillyTavern source; comparable chat-centric UX.
## Architecture
Text-based adventure game with:
- **Frontend/runtime:** Svelte 5 + SvelteKit (CSR-only)
- SSR is disabled: `export const ssr = false`
- Static hosting via `@sveltejs/adapter-static` with `fallback: "index.html"`
- **PWA/offline:** `@vite-pwa/sveltekit` (Workbox)
- Precache app assets (including `sql.js` WASM)
- Runtime caching for Google Fonts
- Network-only for LLM endpoints (avoid caching auth’d responses)
- Service worker is registered from the client (root layout) and surfaces update/offline-ready UX
- **Persistence:** in-browser DB using `sql.js` (WASM SQLite) persisted to IndexedDB
- No file system / no server DB
- Best-effort `navigator.storage.persist()` request to reduce eviction risk
- **LLM providers:** browser `fetch` to OpenAI-compatible APIs
- OpenRouter (user-supplied key)
- LAN KoboldCpp (requires correct CORS on the server)
- **Streaming:** in-process streaming hub (no WebSocket server)