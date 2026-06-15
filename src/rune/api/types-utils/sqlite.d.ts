/** SQLite database access scoped to a location and name */
declare namespace sqlite {
  /**
   * Opens (or creates) a SQLite database. Returns a handle with query/get/exec/run/transaction/close.
   *
   * The `location` controls where the database file is stored. Use a `@`-prefixed scope alias
   * (recommended) or a relative path for a custom location inside the project.
   *
   * The permission token format is `sqlite.read:<location>::<name>` for reads and
   * `sqlite.write:<location>::<name>` for writes. In the location part, `*` stops at `/` and `**` spans
   * path segments (e.g. `sqlite.read:@local-sqlite/**`). In the name part, `*` matches any characters
   * (e.g. `sqlite.read:@local-sqlite/**::my-*`).
   *
   * @param location Storage scope:
   *   - `@local-sqlite` — stored under `.crunes/sqlite/project/` in the local project directory. **Most common choice for project runes.**
   *   - `@local-plugin-sqlite` — stored under `.crunes/sqlite/plugins/<id>/`, namespaced to the current plugin. Use when the rune is distributed as a plugin.
   *   - `@global-plugin-sqlite` — stored globally under `~/.crunes/sqlite/plugins/<id>/`, shared across all projects for this plugin.
   *   - A relative path string — stored at a custom path inside the project directory.
   * @param name Database filename without extension (default: "default")
   */
  function open(location: string, name?: string): Promise<SqliteHandle>

  interface SqliteHandle {
    /**
     * Run a SELECT and return all rows.
     * Requires `sqlite.read:<location>::<name>` permission.
     */
    query(sql: string, params?: unknown[]): Promise<unknown[]>
    /**
     * Run a SELECT and return the first row, or null.
     * Requires `sqlite.read:<location>::<name>` permission.
     */
    get(sql: string, params?: unknown[]): Promise<unknown | null>
    /**
     * Run INSERT/UPDATE/DELETE. Returns { changes, lastInsertRowid }.
     * Requires `sqlite.write:<location>::<name>` permission.
     */
    exec(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>
    /**
     * Runs a multi-statement SQL string. Intended for schema initialization and migrations.
     * Accepts raw SQL only — no parameter binding. Never interpolate user-controlled values.
     * Requires `sqlite.write:<location>::<name>` permission.
     * @param sql Raw SQL string, may contain multiple semicolon-separated statements
     */
    run(sql: string): Promise<void>
    /**
     * Wrap multiple exec calls in a transaction. Rolls back on error.
     * Requires `sqlite.write:<location>::<name>` permission.
     */
    transaction(fn: () => Promise<void>): Promise<void>
    /** Close the database connection */
    close(): Promise<void>
  }
}
