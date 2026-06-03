/** Read, write, and query JSON files with JSONPath support */
declare namespace json {
  /**
   * Reads and parses a JSON file.
   * Requires `fs.read:<path>` permission.
   * @param path Relative file path
   * @param opts Options
   */
  function read(path: string, opts?: { throw?: boolean }): Promise<unknown>

  /**
   * Returns the first value matching a JSONPath query.
   * Requires `fs.read:<path>` permission.
   * @param path Relative file path
   * @param jsonPath JSONPath expression (e.g. $.name)
   * @param defaultValue Returned if path not found
   */
  function readPath(path: string, jsonPath: string, defaultValue?: unknown): Promise<unknown>

  /**
   * Returns all values matching a JSONPath query.
   * Requires `fs.read:<path>` permission.
   * @param path Relative file path
   * @param jsonPath JSONPath expression
   * @param defaultValue Returned if no matches
   */
  function readPathAll(path: string, jsonPath: string, defaultValue?: unknown): Promise<unknown[]>

  /**
   * Serializes and writes a value to a JSON file.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   * @param data Value to serialize
   * @param opts Options
   */
  function write(path: string, data: unknown, opts?: { spaces?: number }): Promise<void>

  /**
   * Reads a JSON file, passes parsed data to callback, writes the result back.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   * @param path Relative file path
   * @param callback Receives (data, { exists }) and returns modified data
   * @param opts Options
   */
  function modify(path: string, callback: (data: unknown, meta: { exists: boolean }) => unknown, opts?: { initial?: unknown; spaces?: number }): Promise<void>
}
