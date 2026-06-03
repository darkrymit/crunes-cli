/** Read and write YAML files */
declare namespace yaml {
  /**
   * Reads and parses a YAML file.
   * Requires `fs.read:<path>` permission.
   * @param path Relative file path
   * @param opts Options
   */
  function read(path: string, opts?: { throw?: boolean }): Promise<unknown>

  /**
   * Serializes and writes a value to a YAML file.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   * @param data Value to serialize
   * @param opts Options
   */
  function write(path: string, data: unknown, opts?: { indent?: number }): Promise<void>

  /**
   * Reads a YAML file, passes parsed data to callback, writes the result back.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   * @param path Relative file path
   * @param callback Receives (data, { exists }) and returns modified data
   * @param opts Options
   */
  function modify(path: string, callback: (data: unknown, meta: { exists: boolean }) => unknown, opts?: { initial?: unknown; indent?: number }): Promise<void>
}
