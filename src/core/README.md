# core

Shared domain logic used across multiple feature modules. Full docs: `docs/knowledge-base/modules/core.md`

## Key Files

- **config.js** — `loadConfig(dir)` — reads and parses `.crunes/config.json` for the given project root.
- **errors.js** — `CircularRuneError` — thrown when a rune call chain loops back on itself.
- **commands/init.js** — `handler()` — creates `.crunes/config.json` in the project root if it doesn't exist.

## Related Modules

- `rune` — `resolver.js` imports both `loadConfig` and `CircularRuneError`.
- `plugin` — Command handlers use `loadConfig` to read project-level plugin settings.
- `template` — Command handlers use `loadConfig` to read local template registrations.
