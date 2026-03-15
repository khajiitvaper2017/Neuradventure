# AGENTS.md

## AI Coding Guidelines

**Workflow & Planning**

* **Batch Operations:** Minimize tool calls and checks. Group edits logically, and use scripts for bulk file refactoring or moving.
* **Plan Revisions:** If a proposed plan is rejected, base your revised plan on the previous one unless they are fundamentally incompatible. Always reference prior plans.
* **Dependencies:** Proactively propose new libraries if they significantly simplify code or improve maintainability. Never leave unused packages behind.

**Code Quality & Standards**

* **Verification:** Run `npm run lint` and `npm run check` after major edits. Always run `npm run format` at the end of your workflow.
* **Continuous Improvement:** If an error bypasses current checks, update the linting rules or configs to catch it in the future.
* **Modernization:** Use the newest stable technologies available. Avoid deprecated code. Do not hesitate to rewrite a module from scratch if it drastically improves simplicity and performance.
* **Legacy Code:** Remove it entirely. Do not write new legacy code. Only use legacy shims if they significantly reduce import clutter.

**UI System & Styling**

* **UI Primitives:** Use the shadcn-style primitives (Tailwind + Bits UI) located in `src/lib/components/ui/**`. **Do not** reintroduce legacy UI widgets.
* **Raw Elements:** Never use raw HTML form elements (e.g., `<button>`, `<label>`, `<select>`, `<textarea>`) outside the `ui/**` folder. Use their capitalized component equivalents instead (e.g., `Button`, `Label`).
* **Design Tokens:** The Accent color defaults to `#c85c5c` (user-configurable) and drives `--primary` and `--ring`. Use `font-story` (Cinzel) for story logs and narrative text. See `DESIGN.md` for extended styling rules.
* **Component Structure:** Extract new UI components into separate files. Files must not exceed ~1000 lines of code.

**File Management**

* **Scope:** Only modify files you have explicitly planned to edit. Ignore unrelated changes in `git status`.
* **Multi-Agent Environment:** Assume other AI agents are working simultaneously. **Do not** delete unassigned files. If your edited file unexpectedly reverts to its previous state, restore your version and continue working. Do not investigate the cause; the user will handle agent conflicts.
* **Cleanup:** Delete empty directories if they are no longer needed.

---

## GBNF Pattern Constraint

* JSON-to-GBNF conversions require all regex patterns to explicitly begin with `^` and end with `$`.

---

## Project Structure

This repository is a **static, installable SvelteKit PWA** with no custom backend.

* `src/routes/**` – SvelteKit routes (Keep these as thin shells).
* **Source of Truth:** Query-param routing handles navigation (e.g., `/game?story=<id>`, `/chat?chat=<id>`).


* `src/lib/**` – Core application code.
* `engine/**` – Browser-only engine (sql.js + IndexedDB persistence, game logic, LLM connectors).
* `services/**` – Domain modules (stories, turns, chats, settings, generate, stream).
* `stores/**` – Svelte stores (UI state, settings, game/chat state, PWA state).
* `features/**` – Feature screens (Home, Game, Chat, Settings).
* `components/**` – Shared UI categories (`controls/`, `inputs/`, `overlays/`, `panels/`, `rich/`, `icons/`).
* `styles/**` – Global CSS and tokens (e.g., `app.css`). Avoid component-scoped `<style>`.
* `shared/**` – Types and configurations.


* `src/app.html` – HTML template (replaces traditional `index.html`).
* `src/app.d.ts` – App-wide TypeScript declarations.
* `static/**` – Static assets (PWA icons, etc.).
* `scripts/**` – Local tooling scripts (lint/check helpers).
* `vite.config.ts` – Vite + PWA configuration.
* `svelte.config.js` – SvelteKit configuration (adapter-static, aliases, Service Worker settings).

---

## Import Rules

* Always use the `@/` prefix for internal imports (this aliases to `src/lib` via `kit.alias` and Vite).

---

## SvelteKit & Svelte Best Practices (Project-Specific)

Adhere to upstream documentation unless explicitly overridden below:

* **Architecture (CSR-Only):** SSR is strictly disabled. Avoid server-only assumptions. Guard browser-specific APIs (`window`, `document`, `navigator`) when necessary.
* **Routing Logic:** Keep `src/routes/**` files thin; offload logic to `src/lib/**`.
* **Head Management:** * Use `<svelte:head>` for per-route `<title>` and metadata.
* PWA manifest links are injected dynamically via `virtual:pwa-info`. Do not hardcode `<link rel="manifest">` in `src/app.html`.


* **Svelte 5 Components:**
* Use **snippets** (`{#snippet ...}{/snippet}` and `{@render ...}`) instead of legacy `<slot>`/`$$slots`.
* Use **keyed** `{#each}` blocks for dynamic lists (e.g., `(item.id)`).


* **Events & Cleanup:**
* Prefer `<svelte:window>` or `<svelte:document>` for global event listeners.
* If using manual `addEventListener` in actions or `onMount`, you must provide proper cleanup.


* **Accessibility (a11y):**
* All interactive controls must have a clear label (`aria-label`, visible text, or `<label for="...">`).
* Use semantic roles/attributes. Do not break focus or navigation flows during route changes or modal triggers.



---

## Architecture Overview

This is a text-based adventure game leveraging the following stack:

* **Frontend / Runtime:** Svelte 5 + SvelteKit.
* SSR Disabled (`export const ssr = false`).
* Static Hosting via `@sveltejs/adapter-static` (`fallback: "index.html"`).


* **PWA / Offline (Workbox):** `@vite-pwa/sveltekit`.
* Precaches app assets, including the `sql.js` WASM file.
* Runtime caching for Google Fonts.
* **Network-only** for LLM endpoints to prevent caching authenticated responses.
* Client-registered Service Worker handles updates and offline-ready UX.


* **Persistence:** In-browser DB via `sql.js` (WASM SQLite) mapped to IndexedDB.
* No file system or server-side DB.
* Relies on best-effort `navigator.storage.persist()` to minimize data eviction.


* **LLM Providers:** Browser `fetch` to OpenAI-compatible APIs.
* Supports OpenRouter (via user-supplied keys).
* Supports LAN KoboldCpp (requires proper CORS configuration on the server).


* **Streaming:** In-process streaming hub (no WebSocket server required).

---

## References

Read-only references for context. **Do not modify these files:**

* `.references_source_code/json-schema`: json-schema guidelines.
* `.references_source_code/zod`: zod guidelines (builds upon json-schema).
* `.references_source_code/koboldcpp`: KoboldCpp source for Adventure/Chat modes and LLM endpoint behaviors.
* `.references_source_code/SillyTavern`: SillyTavern source for comparable chat-centric UX paradigms.