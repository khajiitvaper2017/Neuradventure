# src/lib/services/ Guidelines

- Domain modules that orchestrate engine + stores (fetching, persistence workflows, transformations).
- Prefer pure functions where possible; keep I/O boundaries explicit.
- Validate/normalize external data at the edges (e.g. when reading from storage or LLM responses).
- Avoid legacy code paths; delete/migrate them opportunistically when editing a service.
