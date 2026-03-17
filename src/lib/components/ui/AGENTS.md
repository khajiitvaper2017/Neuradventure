# src/lib/components/ui/ Guidelines (shadcn-svelte)

- Treat this directory as vendored/generated code managed by shadcn-svelte.
- Prefer regenerating/updating via CLI (example: `npx shadcn-svelte@latest add <component>`) over hand edits.
- If a manual edit is unavoidable, keep it minimal and consistent with existing patterns (Tailwind v4, `data-slot` attributes, CSS-variable theming).
- Don’t add legacy variants; remove local hacks if the upstream component now supports the behavior.

