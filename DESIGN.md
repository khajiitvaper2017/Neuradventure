# Neuradventure UI System (shadcn-svelte + Tailwind)

**Archetype:** Minimalist / Refined  
**Differentiator:** quiet micro-contrast (hairline borders + deliberate focus rings) + “library shelf” information density

## Typography

- `font-sans`: Geist Sans (UI)
- `font-mono`: Geist Mono (code/ids)
- `font-story`: Cinzel (narrative/story log text)

## Color + Theming

- Tokens follow shadcn-svelte defaults via CSS variables in `src/lib/styles/app.css`.
- The current theme uses shadcn-svelte’s neutral base tokens. (Brand accent customization is not wired into `--primary` / `--ring` yet.)
- Dark mode is controlled by toggling the `dark` class on `document.documentElement`.

## Rules

- Prefer shadcn-svelte primitives in `src/lib/components/ui/**` for common controls.
- install them via `npx shadcn-svelte@latest add ___`
- Prefer Tailwind utilities over bespoke CSS.
- Avoid component-scoped `<style>` blocks; keep styling in utilities + tokens.
- Any custom CSS must live in `src/lib/styles/app.css` under an explicit `@layer` and remain minimal.

## Use MCP Tools:

- shadcn-svelte-list — List components, blocks, charts, and docs (returns Markdown lists)
- shadcn-svelte-get — Retrieve detailed component/block/doc content as structured JSON (content, metadata, codeBlocks)
- shadcn-svelte-icons — Browse and search Lucide Svelte icons by name/tag (returns Markdown with install + usage snippets; accepts an optional names array for explicit icon selection; supports limit (total returned) and importLimit (how many to include in imports); uses dynamic upstream icon data)
- shadcn-svelte-search — Fuzzy search across components and docs (returns Markdown for display and a results array for programmatic use)
- bits-ui-get — Access Bits UI component API documentation with AI-optimized content from llms.txt endpoints (provides structured API reference tables, implementation details, and clean markdown formatting)

## Svelte MCP Tools

Use the Svelte MCP server for all Svelte 5 and SvelteKit documentation lookups. Call these tools at the start of any task involving Svelte or SvelteKit.

| Tool                | When to use                                                                                                                                                                 |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `list-sections`     | First — discover available documentation sections (returns titles, use_cases, paths).                                                                                       |
| `get-documentation` | After `list-sections` — fetch all sections relevant to the task. Analyze `use_cases` carefully before selecting.                                                            |
| `svelte-autofixer`  | Before sending any Svelte code — analyzes for issues and suggestions. Call repeatedly until no issues remain. Don't worry about load. Fix suggestions too. Call in batches. |

## Codex Agents (multi-agent)

When creating, editing, or reviewing any `.svelte` / `.svelte.ts` / `.svelte.js` file, delegate to the `svelte-file-editor` agent role so it can fetch Svelte docs via the Svelte MCP server and validate edits with `svelte-autofixer`.

### One-time setup

Enable multi-agent and register the role in your Codex config (either global `~/.codex/config.toml` or repo-local `.codex/config.toml`):

```toml
[features]
multi_agent = true

[agents."svelte-file-editor"]
description = "Specialized Svelte 5 code editor for .svelte and .svelte.ts/.svelte.js files (uses Svelte MCP + svelte-autofixer)."
config_file = "agents/svelte-file-editor.toml"
```

Create the role config file at `agents/svelte-file-editor.toml` (resolved relative to the `config.toml` that references it). The role instructions should require:

- `list-sections` + `get-documentation` for any uncertain Svelte 5/SvelteKit behavior
- Always running `svelte-autofixer` after edits and iterating until clean

### Running agents

- Start Codex in the repo root: `codex`
- Ask explicitly for the role when touching Svelte files, e.g. “Spawn a `svelte-file-editor` agent to update `src/routes/+layout.svelte`.”
- Use `/agent` in the CLI to switch between active agent threads; tell Codex to stop/close completed threads.
