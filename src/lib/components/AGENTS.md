# src/lib/components/ Guidelines

- Reusable UI pieces (inputs/panels/overlays/rich/controls). Keep props small and behavior predictable.
- Prefer composing from shadcn-svelte components under `src/lib/components/ui/`.
- Styling: use Tailwind classes and theme CSS variables; avoid component-scoped `<style>` unless there’s a strong reason.
- Avoid creating legacy/compat components; remove legacy patterns when you’re already touching a file.

