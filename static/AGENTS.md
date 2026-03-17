# static/ Guidelines

- Treat files here as shipped assets (PWA icons live in `static/icons/`).
- Keep filenames stable: they’re referenced by `vite.config.ts` (PWA manifest/workbox config).
- When changing icons/manifest assets, regenerate via `npm run generate:pwa-assets` and verify `npm run build`.
- Avoid adding large/unoptimized binaries; remove unused assets when you notice them.

