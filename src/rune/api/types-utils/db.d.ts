/** Relational database access supporting PostgreSQL and MySQL */
declare namespace db {
  /**
   * Connects to a PostgreSQL or MySQL database using a standard URI string.
   * Requires `db.connect:<protocol>:<host>:<port>/<database>` permission. `*` matches any characters (e.g. `db.connect:postgres:*`).
   *
   * Supported protocols: postgres, postgresql, mysql, mysql2
   *
   * @param connectionString Database connection URI (e.g. "postgres://user:pass@localhost:5432/mydb")
   */
  function connect(connectionString: string): Promise<DbClient>

  interface DbClient {
    /**
     * Run a query and return all rows.
     * Matches standard database driver parameters.
     *
     * @param sql SQL query string containing placeholders (e.g. $1 for Postgres, ? for MySQL)
     * @param params Query binding parameters
     */
    query(sql: string, params?: unknown[]): Promise<unknown[]>
    /**
     * Run a query and return the first row, or null if empty.
     *
     * @param sql SQL query string containing placeholders
     * @param params Query binding parameters
     */
    get(sql: string, params?: unknown[]): Promise<unknown | null>
    /**
     * Run INSERT/UPDATE/DELETE queries.
     * Returns { changes: number } where changes is the affected row count.
     *
     * @param sql SQL query string containing placeholders
     * @param params Query binding parameters
     */
    exec(sql: string, params?: unknown[]): Promise<{ changes: number }>
    /**
     * Wrap multiple queries in a transaction. Automatically begins a transaction and commits on success, rolling back on error.
     *
     * @param callback Async function called with a transaction client instance
     */
    transaction(callback: (tx: DbClient) => Promise<unknown>): Promise<unknown>
    /** Close the database connection and release resources */
    close(): Promise<void>
  }
}
