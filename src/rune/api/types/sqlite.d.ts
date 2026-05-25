/** SQLite database access scoped to a location and name */
declare namespace sqlite {
  /**
   * Opens (or creates) a SQLite database. Returns a handle with query/get/exec/transaction/close.
   * @param location Storage scope: "project", "plugin", "global", or a relative path
   * @param name Database filename without extension (default: "default")
   */
  function open(location: string, name?: string): Promise<SqliteHandle>

  interface SqliteHandle {
    /**
     * Run a SELECT and return all rows.
     * Requires `sqlite.read:<location>:<name>` permission.
     */
    query(sql: string, params?: unknown[]): Promise<unknown[]>
    /**
     * Run a SELECT and return the first row, or null.
     * Requires `sqlite.read:<location>:<name>` permission.
     */
    get(sql: string, params?: unknown[]): Promise<unknown | null>
    /**
     * Run INSERT/UPDATE/DELETE. Returns { changes, lastInsertRowid }.
     * Requires `sqlite.write:<location>:<name>` permission.
     */
    exec(sql: string, params?: unknown[]): Promise<{ changes: number; lastInsertRowid: number }>
    /**
     * Wrap multiple exec calls in a transaction. Rolls back on error.
     * Requires `sqlite.write:<location>:<name>` permission.
     */
    transaction(fn: () => Promise<void>): Promise<void>
    /** Close the database connection */
    close(): Promise<void>
  }
}
