/** SQLite database access scoped to a location and name */
declare namespace sqlite {
  /**
   * Opens (or creates) a SQLite database. Returns a handle with query/get/exec/run/transaction/close.
   *
   * The `location` controls where the database file is stored. Use a `@`-prefixed scope alias
   * (recommended) or a relative path for a custom location inside the project.
   *
   * The permission token format is `sqlite.read:<location>::<name>` for reads and
   * `sqlite.write:<location>::<name>` for writes. Use `/**` as a wildcard name when
   * declaring permissions in `config.json` (e.g. `sqlite.read:@local-project-sqlite/**`).
   *
   * @param location Storage scope:
   *   - `@local-project-sqlite` — stored per-project under the local project directory. **Most common choice for project runes.**
   *   - `@local-project-plugin-sqlite` — stored per-project, namespaced to the current plugin. Use when the rune is distributed as a plugin.
   *   - `@global-project-sqlite` — stored globally, keyed by project identity. Persists across working directory changes.
   *   - `@global-plugin-sqlite` — stored globally, shared across all projects for this plugin.
   *   - `@global-project-plugin-sqlite` — stored globally, per-project per-plugin combination.
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
