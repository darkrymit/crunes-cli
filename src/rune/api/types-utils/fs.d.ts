/** File system operations relative to the project root */
declare namespace fs {
  /** Returns the absolute project directory path */
  function cwd(): string

  /**
   * Resolves a relative path to its absolute path on the host filesystem.
   * @param relPath Relative path (default: '.')
   */
  function resolve(relPath?: string): Promise<string>

  /**
   * Reads a file as a UTF-8 string. Returns null if not found and throw is false.
   * Requires `fs.read:<path>` permission.
   * @param path Relative file path
   * @param opts Options
   */
  function read(path: string, opts?: { throw?: boolean }): Promise<string | null>

  /**
   * Returns true if the path exists.
   * Requires `fs.read:<path>` permission.
   * @param path Relative path
   */
  function exists(path: string): Promise<boolean>

  /**
   * Returns file paths matching a glob pattern. Relative patterns only.
   * Requires `fs.glob:<cwd>::<pattern>` permission (convenience form: `fs.glob:<pattern>` sets cwd to project root).
   * When `cwd` is set, returned paths are relative to `cwd`. Without `cwd`, paths are relative to project root.
   * @param pattern Glob pattern (e.g., '**\/*.js')
   * @param opts.cwd Base directory for the glob (relative to project root). Affects permission matching and returned paths.
   * @param opts.ignore Array of patterns to ignore
   * @param opts.onlyDirectories Return directories instead of files
   * @param opts.dot Include dotfiles and dot-directories in the results
   * @param opts.expandDirectories Expand directories to include their contents (defaults to false)
   */
  function glob(pattern: string, opts?: { cwd?: string; ignore?: string[]; onlyDirectories?: boolean; dot?: boolean; expandDirectories?: boolean }): Promise<string[]>

  /**
   * Writes content to a file, creating parent directories as needed.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   * @param content UTF-8 string content
   */
  function write(path: string, content: string): Promise<void>

  /**
   * Copies a file from src to dest.
   * Requires `fs.read:<src>` and `fs.write:<dest>` permissions.
   * @param src Relative source path
   * @param dest Relative destination path
   */
  function copy(src: string, dest: string): Promise<void>

  /**
   * Reads a file, applies a regex replacement, and writes it back.
   * Requires `fs.read:<path>` and `fs.write:<path>` permissions.
   * @param path Relative file path
   * @param regex RegExp or string pattern
   * @param replacement Replacement string
   */
  function replace(path: string, regex: RegExp | string, replacement: string): Promise<void>

  /**
   * Deletes a file or directory recursively.
   * Requires `fs.write:<path>` permission.
   * @param path Relative path to file or directory
   * @param opts.recursive If true, perform a recursive deletion (default: false)
   */
  function remove(path: string, opts?: { recursive?: boolean }): Promise<void>

  /**
   * Moves a file or directory from src to dest.
   * Handles cross-volume transitions automatically (copy-and-delete fallback).
   * Automatically scaffolds parent directories of the destination recursively.
   * Requires `fs.read:<src>` and `fs.write:<dest>` permissions.
   * @param src Relative source path
   * @param dest Relative destination path
   */
  function move(src: string, dest: string): Promise<void>

  /**
   * Returns structural metadata for a file or directory.
   * Requires `fs.read:<path>` permission.
   * @param path Relative path
   */
  function stat(path: string): Promise<{
    size: number
    mtime: string      // ISO timestamp
    birthtime: string  // ISO timestamp
    isDirectory: boolean
    isFile: boolean
  }>

  /**
   * Recursively creates empty directory structures.
   * Requires `fs.write:<path>` permission.
   * @param path Relative directory path to create
   */
  function mkdir(path: string): Promise<void>

  /**
   * Reads a file as raw binary bytes.
   * Requires `fs.read:<path>` permission.
   * @param path Relative file path
   * @param opts Options
   */
  function readAsBytes(path: string, opts?: { throw?: boolean }): Promise<Uint8Array | null>

  /**
   * Writes raw binary bytes to a file, creating parent directories as needed.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   * @param content Raw binary Uint8Array bytes
   */
  function writeAsBytes(path: string, content: Uint8Array): Promise<void>

  /**
   * Appends UTF-8 text to a file, creating parent directories if needed.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   * @param content UTF-8 string content to append
   */
  function append(path: string, content: string): Promise<void>

  /**
   * Appends raw binary bytes to a file, creating parent directories if needed.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   * @param content Raw binary Uint8Array bytes to append
   */
  function appendAsBytes(path: string, content: Uint8Array): Promise<void>

  /**
   * Changes file permissions.
   * On Windows this call succeeds silently — the execute bit is not meaningful on Windows.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   * @param mode Permission mode string (e.g. "755", "a+x") or numeric octal (e.g. 0o755)
   */
  function chmod(path: string, mode: string | number): Promise<void>

  /**
   * Reads a file chunk-by-chunk as a UTF-8 string stream.
   * Requires `fs.read:<path>` permission.
   * @param path Relative file path
   */
  function readStream(path: string): ReadableStream<string>

  /**
   * Writes to a file chunk-by-chunk using a UTF-8 string stream.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   */
  function writeStream(path: string): WritableStream<string>

  /**
   * Reads a file chunk-by-chunk as a raw binary byte stream.
   * Requires `fs.read:<path>` permission.
   * @param path Relative file path
   */
  function readStreamAsBytes(path: string): ReadableStream<Uint8Array>

  /**
   * Writes to a file chunk-by-chunk using a raw binary byte stream.
   * Requires `fs.write:<path>` permission.
   * @param path Relative file path
   */
  function writeStreamAsBytes(path: string): WritableStream<Uint8Array>
}
