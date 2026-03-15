# Neuradventure

A **static, installable SvelteKit PWA** for text-based adventures and chat, with **local saves** stored in your browser (no custom backend).

## Play online

Hosted version: https://neuradventure.pages.dev/

## Features

- **Offline-first PWA**: installable, cached assets, works offline after first load
- **Local persistence**: in-browser database (`sql.js` + IndexedDB)
- **LLM connectors (client-side fetch)**:
  - **KoboldCpp** (default: `http://localhost:5001/v1`)
  - **OpenRouter** (bring your own API key)
- **Deep-link routing** (query params are the source of truth):
  - `/game?story=<id>`
  - `/chat?chat=<id>`

## Quickstart (recommended)

### macOS / Linux

```bash
./run.sh
```

### Windows

```bat
run.bat
```

These scripts:

- Ensure Node.js + npm are available (may attempt to install them)
- Run `npm install --no-package-lock` (this repo intentionally does not use a lockfile)
- Build the app and serve it with `vite preview` (defaults to `http://localhost:3001`)

You can customize the preview host/port:

```bash
HOST=127.0.0.1 PORT=3001 ./run.sh
```

## Development

Prereqs: Node.js **18+** (20+ recommended).

```bash
npm install --no-package-lock
npm run dev
```

Quality checks:

```bash
npm run lint
npm run check
npm run format
```

## Build & Deploy (static hosting)

```bash
npm install --no-package-lock
npm run build
```

Deploy the output in `build/` to any static host (the app is built as an SPA with `fallback: index.html`).

## Using an LLM connector

Open **Settings → Generation/Connector** inside the app and configure:

- **KoboldCpp**: set the base URL (default `http://localhost:5001/v1`) and ensure **CORS is enabled** on the server
- **OpenRouter**: set the OpenRouter base URL/model and provide an API key (stored locally in your browser)

## Data & privacy

- Saves and settings live **only in your browser** (IndexedDB + cached assets).
- Data is scoped to the **site origin** (`scheme://host:port`). For example, `http://localhost:5173` and `https://neuradventure.pages.dev` do **not** share saves.
- To fully reset the app, clear the site’s storage in your browser (Site settings → Clear data).

## Repo structure (high level)

- `src/routes/**`: thin SvelteKit route shells
- `src/lib/**`: application code (engine, services, stores, features, components)
- `static/**`: icons and static assets
