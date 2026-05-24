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
   * @param path Relative file path
   * @param opts Options
   */
  function read(path: string, opts?: { throw?: boolean }): Promise<string | null>

  /**
   * Returns true if the path exists.
   * @param path Relative path
   */
  function exists(path: string): Promise<boolean>

  /**
   * Returns file paths matching a glob pattern. Relative patterns only.
   * @param pattern Glob pattern (e.g., 'src/**\/*.js')
   * @param opts.ignore Array of patterns to ignore
   * @param opts.onlyDirectories Return directories instead of files
   * @param opts.dot Include dotfiles and dot-directories in the results
   * @param opts.expandDirectories Expand directories to include their contents (defaults to false)
   */
  function glob(pattern: string, opts?: { ignore?: string[]; onlyDirectories?: boolean; dot?: boolean; expandDirectories?: boolean }): Promise<string[]>

  /**
   * Writes content to a file, creating parent directories as needed.
   * @param path Relative file path
   * @param content UTF-8 string content
   */
  function write(path: string, content: string): Promise<void>

  /**
   * Copies a file from src to dest.
   * @param src Relative source path
   * @param dest Relative destination path
   */
  function copy(src: string, dest: string): Promise<void>

  /**
   * Reads a file, applies a regex replacement, and writes it back.
   * @param path Relative file path
   * @param regex RegExp or string pattern
   * @param replacement Replacement string
   */
  function replace(path: string, regex: RegExp | string, replacement: string): Promise<void>
}
