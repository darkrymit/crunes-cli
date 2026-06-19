/** Read and write XML files with JSONPath support */
declare namespace xml {
  // Parsed object conventions:
  //   @_name   — XML attribute `name` (e.g. `node['@_id']`)
  //   #comment — array of comment strings at this node
  //   #cdata   — CDATA section content

  /**
   * Parses an XML string to a JS object.
   */
  function parse(text: string): unknown

  /**
   * Serializes a JS object to an XML string.
   */
  function stringify(data: unknown, opts?: { indent?: number }): string

  /**
   * Reads and parses an XML file to a JS object.
   * Requires `fs.read:<path>` permission.
   */
  function read(path: string, opts?: { throw?: boolean }): Promise<object | null>

  /**
   * Serializes a JS object to XML and writes it to a file.
   * Requires `fs.write:<path>` permission.
   */
  function write(path: string, data: unknown, opts?: { indent?: number }): Promise<void>

  /**
   * Reads an XML file, passes parsed data to callback, writes the result back.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   */
  function modify(path: string, callback: (data: unknown, meta: { exists: boolean }) => unknown, opts?: { initial?: object; indent?: number }): Promise<void>

  /**
   * Returns the first value matching a JSONPath query.
   * Returns `fallback` if the file is missing or the path has no match.
   * Requires `fs.read:<path>` permission.
   */
  function readPath(path: string, jsonPath: string, fallback?: unknown): Promise<unknown>

  /**
   * Returns all values matching a JSONPath query.
   * Returns `fallback` if the file is missing or the path has no matches.
   * Requires `fs.read:<path>` permission.
   */
  function readPathAll(path: string, jsonPath: string, fallback?: unknown[]): Promise<unknown[]>

  /**
   * Sets or deletes a single node at a JSONPath in an XML file.
   * Missing intermediate nodes are created as `{}`.
   * `value === undefined` deletes the node.
   * Throws if the file does not exist — use `modify` with `initial` to create XML files from scratch.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   */
  function writePath(path: string, jsonPath: string, value: unknown, opts?: { indent?: number }): Promise<void>
}
