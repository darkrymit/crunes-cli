# store

Centralised path helpers for the crunes store directory (`~/.crunes/` or `$CRUNES_STORE`). No logic — only path resolution and directory bootstrapping. Full docs: `docs/knowledge-base/modules/store.md`

The store root doubles as the **global config directory**: `<store>/config.json` is the lowest config layer, with global runes at `<store>/runes/<key>.js` and templates at `<store>/templates/<name>.js` — no `.crunes/` segment.

## Files

- **index.js** — `getStorePath()` — returns the store root (`$CRUNES_STORE` or `~/.crunes`). Path helpers: `getProjectsJsonPath()`, `getPluginsJsonPath()`, `getPluginCacheDir(name, version, marketplace?)`, `getPnpmStorePath()`, `getMarketplacesJsonPath()`, `getMarketplaceCacheDir(name)`, `getCacheBasePath()`, `getSqliteBasePath()`, `getCacheJsonPath()`, `getSqliteJsonPath()`. `ensureStoreDirs()` — creates all required store subdirectories.
  - `isRootless(projectDir)` — true when `<projectDir>/.crunes/config.json` is absent.
  - `getRootlessBase(projectDir)` — `<store>/rootless/<8-char sha1 of projectDir>`.
  - `getLocalBase(projectDir)` — where per-project local state lives: `<projectDir>/.crunes` for a real project, otherwise `getRootlessBase(projectDir)`. Every consumer of local state (caches, sqlite, jobs, schemas, `node_modules`, and the `@local-*` virtual path prefixes) resolves through this one function, which is what keeps a rootless run from writing into the working directory.
- **storage-key.js** — `storageKey(type, { projectId, pluginId, name })` — generates a scoped storage key with a short hash suffix for use as bucket/database identifiers.

## Related Modules

- `core` — reads `<store>/config.json` as the global config layer; `config-writer.js` targets it for every `-g` command.
- `job` — imports `getLocalBase` for job directory paths.
- `rune` — imports `getLocalBase` for schema caches, `node_modules`, and `@local-*` path resolution; `isRootless` to skip project identity registration.
- `project` — imports `getProjectsJsonPath`.
- `cache` — imports `getCacheBasePath`, `getCacheJsonPath`, and `storageKey`.
- `sqlite` — imports `getSqliteBasePath`, `getSqliteJsonPath`, and `storageKey`.
- `plugin` — imports `getPluginsJsonPath`, `getPluginCacheDir`, `getPnpmStorePath`, `ensureStoreDirs`.
- `marketplace` — imports `getMarketplacesJsonPath`, `getMarketplaceCacheDir`, `ensureStoreDirs`.
