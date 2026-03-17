# src/routes/ Guidelines

- Routes are shells: compose `src/lib/features/*` and stores; avoid business logic here.
- Don’t add server-only code (`+page.server.*`, secrets, DB access). This repo is static/client-rendered.
- Keep page modules focused on wiring and small URL/param handling; route state belongs in `src/lib/stores/`.
- Avoid legacy patterns when adding new pages; remove dead/legacy route code when you touch it.

