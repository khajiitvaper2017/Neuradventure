# src/lib/shared/ Guidelines

- Shared types, constants, and configuration used across the app.
- Keep this layer dependency-light to avoid import cycles.
- Avoid legacy config flags and compatibility types; delete/migrate them when you encounter them.
