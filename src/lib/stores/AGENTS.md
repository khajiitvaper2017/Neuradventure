# src/lib/stores/ Guidelines

- Existing app state uses `svelte/store`. Keep stores small and focused; avoid adding new stores unless necessary (prefer runes + context/reactive classes for new code where practical).
- Avoid circular dependencies between stores; extract shared helpers into `src/lib/utils/` if needed.
- Prefer derived state over duplicating computed values in multiple stores.
- Don’t add legacy/compat state shims; remove dead/legacy state when touching a store module.
