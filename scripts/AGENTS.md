# scripts/ Guidelines

- Scripts run via `tsx` and are invoked from `package.json` (examples: `npm run check`, `npm run check:css`).
- Keep scripts deterministic and fast: no network calls, no interactive prompts, exit non-zero on failure.
- Prefer checking `src/` and `scripts/` only; avoid writing generated files.
- Don’t add “legacy” shims/compat layers; when touching a script, delete dead/legacy paths opportunistically.

