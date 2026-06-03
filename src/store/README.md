# store

Centralised path helpers for the crunes store directory (`~/.crunes/` or `$CRUNES_STORE`). No logic — only path resolution and directory bootstrapping. Full docs: `docs/knowledge-base/modules/store.md`

## Files

- **index.js** — `getStorePath()` — returns the store root (`$CRUNES_STORE` or `~/.crunes`). Path helpers: `getProjectsJsonPath()`, `getPluginsJsonPath()`, `getPluginCacheDir(name, version, marketplace?)`, `getPnpmStorePath()`, `getMarketplacesJsonPath()`, `getMarketplaceCacheDir(name)`, `getCachesBasePath()`, `getSqliteBasePath()`, `getCacheJsonPath()`, `getSqliteJsonPath()`. `ensureStoreDirs()` — creates all required store subdirectories.
- **storage-key.js** — `storageKey(type, { projectId, pluginId, name })` — generates a scoped storage key with a short hash suffix for use as bucket/database identifiers.

## Related Modules

- `job` — imports `getStorePath` for job directory paths.
- `project` — imports `getProjectsJsonPath`.
- `cache` — imports `getCachesBasePath`, `getCacheJsonPath`, and `storageKey`.
- `sqlite` — imports `getSqliteBasePath`, `getSqliteJsonPath`, and `storageKey`.
- `plugin` — imports `getPluginsJsonPath`, `getPluginCacheDir`, `getPnpmStorePath`, `ensureStoreDirs`.
- `marketplace` — imports `getMarketplacesJsonPath`, `getMarketplaceCacheDir`, `ensureStoreDirs`.
