# sqlite

Rune-visible SQLite store: named databases registered in a central index at `~/.crunes/sqlite.json`. Full docs: `docs/knowledge-base/modules/sqlite.md`

## Files

- **index.js** — Path helpers: `getSqlitePluginDir(pluginId)`. Registry: `loadSqliteDbs()`, `upsertSqliteDb(resolvedPath, opts)`, `listSqliteDbs()`, `listLocalSqliteDbs(projectDir)`, `resolveKey(id, databases)`. Mutations: `deleteSqliteDb(id)` — deletes a database and its files. `querySqliteDb(id, sql)` — executes a read-only SQL query.
- **commands/list.js** — `handler({ projectDir, plugin })` — lists SQLite databases with optional plugin filter.
- **commands/delete.js** — `handler({ id, yes, projectDir })` — deletes a SQLite database with confirmation.
- **commands/query.js** — `handler({ id, sql, projectDir })` — executes a SQL query against a database and prints results.

## Related Modules

- `store` — `getSqliteBasePath()` and `getSqliteJsonPath()` resolve database and registry paths. `storage-key.js` generates scoped storage keys.
- `rune` — `api/sqlite.js` calls `upsertSqliteDb` when runes open a database handle.
