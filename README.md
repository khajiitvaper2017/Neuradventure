# Neuradventure

Neuradventure is a local-first AI storytelling and chat app for building interactive stories, managing character libraries, and running conversational scenes with your own model endpoint.

Live demo: https://neuradventure.pages.dev/

## What It Does

- Create and play through branching story scenes.
- Run multi-character chat sessions.
- Generate characters, stories, and chat setups from prompts.
- Configure story modules to control how a story behaves and what the model sees.
- Import and export stories and characters.
- Store data locally in the browser.
- Use streamed responses when your connector supports it.
- Install as a PWA for a more app-like experience.

## Main Screens

- Home: your library of stories, chats, and characters.
- Story mode: play interactive narrative sessions.
- Chat mode: manage character conversations.
- Settings: configure your connector, prompts, generation parameters, and local data options.

## Story Modules

Story modules control what the model tracks during a story and which state gets surfaced back into the UI.
It makes sense to disable unneeded modules to save tokens.

- Core
  - Track NPCs: keep NPC state and updates enabled for new stories.
  - Track background events: generate hidden off-screen events each turn.
- Characters
  - Appearance + clothing
  - Personality traits
  - Major flaws
  - Perks
  - Inventory
  - Memories (currently doesn't replace log history)
  - Location
  - Activity
- Custom fields
  - Per-story enable/disable controls for user-defined character fields.
  - Missing custom-field entries default to enabled.

## Supported Connectors

Neuradventure is designed to work with local or hosted LLM backends.

- KoboldCpp
- OpenRouter

By default, the app points at a local KoboldCpp-style endpoint on `http://localhost:5001/v1`.
If you use OpenRouter, add your API key in Settings. Keys are stored locally on your device and are not meant to be committed or shared.

## Local Development

### Prerequisites

- Node.js
- npm

### Install

```bash
npm install
```

### Run

```bash
npm run dev
```

Then open the local URL shown by Vite, usually `http://localhost:5173`.

### Quality Checks

```bash
npm run check
npm run format
npm run build
```

## Data And Storage

- Stories, chats, characters, settings, and prompt history are stored locally.
- The app uses browser storage plus a local SQLite-backed layer for persistence.
- Character cards and story data can be imported/exported from the home screen and settings pages.

## Deployment

This project is set up as a static SvelteKit app and can be deployed to static hosting platforms such as Cloudflare Pages.

The public site is:

https://neuradventure.pages.dev/

## Tech Stack

- SvelteKit
- Svelte 5
- TypeScript
- Tailwind CSS
- shadcn-svelte / Bits UI
- sql.js
- Vite PWA
