# src/lib/stores/ Guidelines

- Centralized app state using `svelte/store`. Keep stores small and focused.
- Avoid circular dependencies between stores; extract shared helpers into `src/lib/utils/` if needed.
- Prefer derived state over duplicating computed values in multiple stores.
- Don’t add legacy/compat state shims; remove dead/legacy state when touching a store module.

