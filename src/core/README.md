# core

Shared domain logic used across multiple feature modules: config loading/merging/validation and error types. Full docs: `docs/kb/crunes-cli/modules/core.md`

## Files

- **config.js** — `loadConfig(dir)` — reads and deep-merges three layers, lowest to highest: `<store>/config.json` (global), `<dir>/.crunes/config.json`, `<dir>/.crunes/config.local.json`. A missing global layer is normal; invalid global JSON is a hard error. `CRUNES_NO_GLOBAL=1` skips the global layer. The result carries `ROOTLESS` (`Symbol.for('crunes.rootless')`), true when no project config was found.
  - `mergeConfigs(shared, local)` — deep-merges two config objects, handling runes, templates, and plugins; every other top-level key is last-wins.
  - `absolutizeEntryPaths(config, baseDir, layer)` — resolves the files a layer's `run`, `args` and `repl` blocks name, and its `templates[*].path`, against its own base dir **before** merging, and stamps each entry with `LAYER` (`Symbol.for('crunes.layer')`, one of `global | project | local`, display-only). Only the global layer fills in a default template path (`templates/<key>`); an entry that overrides just `vars` inherits the command of the layer that defined it. A template entry that refers to a plugin (`entry.plugin`, or a key containing `:`) never gets a default path.
  - `coercePlugins(plugins)` / `enabledPluginKeys(config)` — `plugins` is a boolean map; anything else is treated as empty. `enabledPluginKeys` returns only keys set to exactly `true`.
  - `validateConfig(config, fileName?, { base, layer }?)` — validates one layer: refuses an entry-level `path` or `permissions`, checks block shapes, and that `plugins` values are booleans.
- **config-writer.js** — the single writer for `config.json`. `getConfigPath({ configRoot, global })` — `<store>/config.json` when global (no `.crunes/` segment), else `<configRoot>/.crunes/config.json`. `readRawConfig(path)` — parsed object or `null` if absent. `writeRawConfig(path, config)` — atomic temp-file write. `setPluginEnabled(path, key, enabled)` — sets one plugin key. **Writers only ever touch raw file contents** — a merged config object must never be persisted, or absolutized paths would leak to disk.
- **errors.js** — `CircularRuneError` — thrown when a rune call chain loops back on itself; the chain is in the message.
- **commands/init.js** — `handler({ yes, projectRoot, global })` — creates `config.json` in the project (plus a `.gitignore` scaffold) or, with `global`, at the store root.

## Related Modules

- `rune` — `resolver.js` imports `loadConfig`, `getRune`, and `CircularRuneError`.
- `plugin` — Command handlers use `loadConfig` to read project-level plugin settings.
- `template` — Command handlers use `loadConfig` to read local template registrations.
- `docs` — `intro.js` and `rune.js` handlers call `loadConfig` to resolve rune entries.
- `store` — `config.js` reads `getStorePath()` for the global layer; `config-writer.js` targets it for every `-g` command.
