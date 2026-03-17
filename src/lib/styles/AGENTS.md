# src/lib/styles/ Guidelines

- Global styling lives in `src/lib/styles/app.css` (Tailwind v4 entry + CSS-variable theme).
- Prefer changing CSS variables (e.g. `--primary` / `--primary-foreground`) instead of rewriting class names everywhere.
- Keep global CSS imported from a single place (currently `src/lib/features/app/AppShell.svelte`).
- Avoid legacy Tailwind patterns/config drift; remove unused variables/layers when you touch this file.

