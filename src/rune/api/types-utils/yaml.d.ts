/** Read and write YAML files with comment preservation and JSONPath support */
declare namespace yaml {
  // Comment keys on plain objects (survive ivm copy, structuredClone, spread):
  //   #head           — comment before the root mapping
  //   #tail           — comment after the root mapping
  //   #comment:key    — comment on the line before `key`
  //   #inline:key     — inline comment after the value of `key`
  //   #style:key      — scalar style: 'literal' | 'folded' | 'single' | 'double'
  //   #flow:key       — true if the sequence value of `key` uses flow style
  //   #comment:key[i] — comment before array item i of `key`

  /**
   * Parses a YAML string to a JS value. Comment metadata encoded as `#`-prefixed keys.
   */
  function parse(text: string): unknown

  /**
   * Serializes a JS value to a YAML string. `#`-prefixed comment keys written as YAML comments.
   */
  function stringify(data: unknown, opts?: { indent?: number }): string

  /**
   * Reads and parses a YAML file. Comment metadata encoded as `#`-prefixed keys.
   * Requires `fs.read:<path>` permission.
   */
  function read(path: string, opts?: { throw?: boolean }): Promise<unknown>

  /**
   * Serializes and writes a value to a YAML file.
   * Requires `fs.write:<path>` permission.
   */
  function write(path: string, data: unknown, opts?: { indent?: number }): Promise<void>

  /**
   * Reads a YAML file, passes parsed data to callback, writes the result back.
   * Comment metadata survives the round-trip.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   */
  function modify(path: string, callback: (data: unknown, meta: { exists: boolean }) => unknown, opts?: { initial?: unknown; indent?: number }): Promise<void>

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
   * Sets or deletes a single node at a JSONPath in a YAML file.
   * Missing intermediate nodes are created as `{}`. Missing file treated as `{}`.
   * `value === undefined` deletes the node; if the file is also missing, no-op.
   * Comment metadata is preserved through the operation.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   */
  function writePath(path: string, jsonPath: string, value: unknown, opts?: { indent?: number }): Promise<void>
}
