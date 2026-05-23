# store

Centralised path helpers for the crunes store directory (`~/.crunes/` or `$CRUNES_STORE`). Full docs: `docs/knowledge-base/modules/store.md`

## Key Files

- **index.js** — `getStorePath()`, `getProjectsJsonPath()`, `getPluginsJsonPath()`, `getPluginCacheDir()`, `getPnpmStorePath()`, `getMarketplacesJsonPath()`, `getMarketplaceCacheDir()`, `getCachesBasePath()`, `getSqliteBasePath()`, `getCacheJsonPath()`, `getSqliteJsonPath()`, `ensureStoreDirs()`.

## Related Modules

- `job` — imports `getStorePath` for job directory paths.
- `project` — imports `getProjectsJsonPath`.
- `cache` — imports `getCachesBasePath`, `getCacheJsonPath`.
- `sqlite` — imports `getSqliteBasePath`, `getSqliteJsonPath`.
- `plugin` — imports `getPluginsJsonPath`, `getPluginCacheDir`, `getPnpmStorePath`, `ensureStoreDirs`.
- `marketplace` — imports `getMarketplacesJsonPath`, `getMarketplaceCacheDir`, `ensureStoreDirs`.
