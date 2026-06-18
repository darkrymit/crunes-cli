/** Read, write, and query JSON/JSONC/JSON5 files with JSONPath support */
declare namespace json {
  type Format = 'json' | 'jsonc' | 'json5'

  /**
   * Reads and parses a JSON/JSONC/JSON5 file. Format is auto-detected from extension.
   * JSONC files return comment metadata as `#head`, `#tail`, `#comment:key`, `#inline:key` string properties.
   * Requires `fs.read:<path>` permission.
   */
  function read(path: string, opts?: { throw?: boolean; format?: Format }): Promise<unknown>

  /**
   * Returns the first value matching a JSONPath query.
   * Requires `fs.read:<path>` permission.
   */
  function readPath(path: string, jsonPath: string, defaultValue?: unknown, opts?: { format?: Format }): Promise<unknown>

  /**
   * Returns all values matching a JSONPath query.
   * Requires `fs.read:<path>` permission.
   */
  function readPathAll(path: string, jsonPath: string, defaultValue?: unknown, opts?: { format?: Format }): Promise<unknown[]>

  /**
   * Serializes and writes a value to a JSON/JSONC/JSON5 file. Format is auto-detected from extension.
   * JSONC comment metadata (`#head`, `#tail`, `#comment:key`, `#inline:key`) is written as JSONC comments.
   * Requires `fs.write:<path>` permission.
   */
  function write(path: string, data: unknown, opts?: { spaces?: number; format?: Format }): Promise<void>

  /**
   * Reads a JSON file, passes parsed data to callback, writes the result back.
   * JSONC comment metadata survives the round-trip.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   */
  function modify(path: string, callback: (data: unknown, meta: { exists: boolean }) => unknown, opts?: { initial?: unknown; spaces?: number; format?: Format }): Promise<void>

  /**
   * Sets or deletes a single node at a JSONPath in a JSON/JSONC/JSON5 file.
   * Missing intermediate nodes are created automatically. Missing file is treated as `{}`.
   * `value === undefined` deletes the node; if the file is also missing, no-op.
   * JSONC comment metadata is preserved through the operation.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   */
  function writePath(path: string, jsonPath: string, value: unknown, opts?: { spaces?: number; format?: Format }): Promise<void>
}
