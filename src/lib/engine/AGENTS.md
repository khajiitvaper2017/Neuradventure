# src/lib/engine/ Guidelines

- Browser-first runtime code (DB/persistence, LLM connectors, streaming, game logic).
- Keep this layer UI-framework-agnostic: no Svelte components; avoid `$app/*` unless unavoidable.
- Be explicit about side effects (storage, fetch). Handle failures and keep migrations/backfills safe.
- Don’t add legacy connector paths or deprecated APIs; remove unused/legacy engine code when working in a file.

