# sqlite

Rune-visible SQLite store: named databases registered in a central index at `~/.crunes/sqlite.json`. Full docs: `docs/knowledge-base/modules/sqlite.md`

## Files

- **index.js** — Path helpers: `getSqlitePluginDir(pluginId)`, `getSqliteProjectDir(key)`, `getSqliteProjectPluginDir(key, pluginId)`. Registry: `loadSqliteDbs()`, `upsertSqliteDb(resolvedPath, opts)`, `listSqliteDbs(projectKey?)`, `listLocalSqliteDbs(projectDir)`, `resolveKey(id, databases)`. Mutations: `deleteSqliteDb(id, projectKey?)` — deletes a database and its files. `querySqliteDb(id, sql, projectKey?)` — executes a read-only SQL query.
- **commands/list.js** — `handler({ projectDir, global, plugin })` — lists SQLite databases with optional filtering by project or plugin.
- **commands/delete.js** — `handler({ id, yes, projectDir, global })` — deletes a SQLite database with confirmation.
- **commands/query.js** — `handler({ id, sql, projectDir, global })` — executes a SQL query against a database and prints results.

## Related Modules

- `store` — `getSqliteBasePath()` and `getSqliteJsonPath()` resolve database and registry paths. `storage-key.js` generates scoped storage keys.
- `rune` — `api/sqlite.js` calls `upsertSqliteDb` when runes open a database handle.
- `project` — `ensureProjectIdentity` and `upsertProject` are called when registering new databases.
