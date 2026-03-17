# src/lib/ Guidelines

- Primary application code lives here (engine, features, components, stores, services).
- Svelte 5: prefer runes style for new component logic (`$state`, `$derived`, `$effect`).
- Keep modules layered: `features/` and `components/` can depend on `stores/` + `services/` + `engine/`, not the other way around.
- Avoid creating legacy/compat code; delete/migrate it opportunistically when editing files.

