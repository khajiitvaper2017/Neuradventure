# src/lib/ Guidelines

- Primary application code lives here (domain, db, llm, config, secrets, types, utils, features, components, stores, services).
- Svelte 5: prefer runes style for new component logic (`$state`, `$derived`, `$effect`).
- Prefer `$derived` over effects; use `untrack(() => ...)` for one-time init that reads reactive values.
- Keep modules layered: `features/` + `components/` can depend on `stores/` + `services/` + `domain/` + `db/` + `llm/`, not the other way around.
- Avoid creating legacy/compat code; delete/migrate it opportunistically when editing files.
