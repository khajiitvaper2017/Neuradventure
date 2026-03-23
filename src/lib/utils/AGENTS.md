# src/lib/utils/ Guidelines

- Small, reusable helpers. Prefer pure functions and explicit inputs/outputs.
- Avoid importing UI modules from utilities; keep dependencies one-way (utils should be low-level).
- Remove dead/legacy helpers opportunistically when editing a utility.
