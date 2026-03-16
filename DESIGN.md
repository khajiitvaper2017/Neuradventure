# Neuradventure UI System

**Style:** Minimalist — hairline borders, deliberate focus rings, dense information layout.

## Fonts

- `font-sans`: Geist Sans
- `font-mono`: Geist Mono
- `font-story`: Cinzel

## Styling Rules

- Use shadcn-svelte components from `src/lib/components/ui/**`
- Install via: `npx shadcn-svelte@latest add <name>`
- Use Tailwind utilities — no component `<style>` blocks
- Custom CSS goes in `src/lib/styles/app.css` inside an `@layer`, keep it minimal
- Prefer Input Group pattern

## MCP Tools — use these, don't guess

- `shadcn-svelte-list` — list available components/blocks/charts
- `shadcn-svelte-get` — get component details and code
- `shadcn-svelte-icons` — search Lucide icons
- `shadcn-svelte-search` — fuzzy search components/docs
- `bits-ui-get` — Bits UI API reference

## Svelte — always look up docs before writing code

1. `list-sections` → find relevant docs
2. `get-documentation` → read them
3. `svelte-autofixer` → validate all `.svelte` files before finishing; repeat until clean

## When editing `.svelte` files

Use the `svelte-file-editor` agent role — it fetches Svelte docs and runs autofixer.
