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
