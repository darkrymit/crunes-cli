/** SQLite database access scoped to a location and name */
declare namespace sqlite {
  /**
   * Opens (or creates) a SQLite database. Returns a handle with query/get/exec/transaction/close.
   * @param location Storage scope: "project", "plugin", "global", or a relative path
   * @param name Database filename without extension (default: "default")
   */
  function open(location: string, name?: string): Promise<SqliteHandle>

  interface SqliteHandle {
    /** Run a SELECT and return all rows */
    query(sql: string, params?: unknown[]): unknown[]
    /** Run a SELECT and return the first row, or null */
    get(sql: string, params?: unknown[]): unknown | null
    /** Run INSERT/UPDATE/DELETE. Returns { changes, lastInsertRowid } */
    exec(sql: string, params?: unknown[]): { changes: number; lastInsertRowid: number }
    /** Wrap multiple exec calls in a transaction. Rolls back on error. */
    transaction(fn: () => Promise<void>): Promise<void>
    /** Close the database connection */
    close(): void
  }
}
