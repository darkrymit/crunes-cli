# core

Shared domain logic used across multiple feature modules: config loading/merging/validation and error types. Full docs: `docs/knowledge-base/modules/core.md`

## Files

- **config.js** — `loadConfig(dir)` — reads and deep-merges `.crunes/config.json` and `.crunes/config.local.json` for the given project root. `mergeConfigs(shared, local)` — deep-merges two config objects, handling runes, vars, permissions, and plugins. `validateConfig(config, fileName?)` — validates config structure, ensuring permissions are lifecycle-scoped.
- **errors.js** — `CircularRuneError` — thrown when a rune call chain loops back on itself; carries the full `chain` array.
- **commands/init.js** — `handler({ yes, projectRoot })` — creates `.crunes/config.json` and `.gitignore` in the project root if they don't exist.

## Related Modules

- `rune` — `resolver.js` imports `loadConfig`, `getRune`, and `CircularRuneError`.
- `plugin` — Command handlers use `loadConfig` to read project-level plugin settings.
- `template` — Command handlers use `loadConfig` to read local template registrations.
- `docs` — `intro.js` and `rune.js` handlers call `loadConfig` to resolve rune entries.
