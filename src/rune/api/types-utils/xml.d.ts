/** Read and write XML files */
declare namespace xml {
  /**
   * Reads and parses an XML file to a JS object.
   * Requires `fs.read:<path>` permission.
   * @param path Relative file path
   * @param opts Options
   */
  function read(path: string, opts?: { throw?: boolean }): Promise<object | null>

  /**
   * Serializes a JS object to XML and writes it to a file.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   * @param data JS object to serialize
   * @param opts Options
   */
  function write(path: string, data: object, opts?: { indent?: number }): Promise<void>

  /**
   * Reads an XML file, passes parsed data to callback, writes the result back.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   * @param path Relative file path
   * @param callback Receives (data, { exists }) and returns modified data
   * @param opts Options
   */
  function modify(path: string, callback: (data: unknown, meta: { exists: boolean }) => unknown, opts?: { initial?: unknown; indent?: number }): Promise<void>
}
