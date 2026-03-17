# src/lib/features/ Guidelines

- Feature screens and flows. Compose from `stores/`, `services/`, and `components/`.
- Keep feature boundaries clear (Chat/Game/Settings/etc.); avoid cross-feature imports when a shared module fits better.
- Prefer `$derived` for computed UI state; avoid `$effect` that exists only to copy/transform state.
- Prefer existing shadcn-svelte components in `src/lib/components/ui/` over bespoke primitives.
- Don’t introduce legacy Svelte patterns; opportunistically delete/migrate legacy code when editing a feature.
