# sqlite

Rune-visible SQLite store: named databases registered in a central index. Full docs: `docs/knowledge-base/modules/sqlite.md`

## Key Files

- **index.js** — `sqliteDbKey()`, `loadSqliteDbs()`, `upsertSqliteDb()`, `listSqliteDbs()`, `resolveKey()`, `deleteSqliteDb()`, `querySqliteDb()`. Also path helpers: `getSqlitePluginDir()`, `getSqliteProjectDir()`, `getSqliteProjectPluginDir()`.

## Sub-directories

- **commands/** — CLI handlers: `list`, `delete`, `query`.

## Related Modules

- `store` — `getSqliteBasePath()` and `getSqliteJsonPath()` resolve database and registry paths.
- `rune` — `api/sqlite.js` calls `upsertSqliteDb` when runes open a database; `api/utils.js` imports path helpers to locate database directories.
