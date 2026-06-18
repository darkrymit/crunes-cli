/** Run shell commands from the project directory */
declare namespace shell {
  /**
   * Runs a shell command asynchronously and returns its output as a string.
   * Requires `shell.run:<command>` permission. `*` matches any characters (e.g. `shell.run:bash *`).
   *
   * @param cmd Shell command to execute
   * @param opts Option object to configure shell execution
   * @param opts.throw Throw a ShellError on non-zero exit codes (default: true). If false, returns the result object.
   * @param opts.trim Trim leading/trailing whitespace from stdout (default: true).
   * @param opts.timeout Timeout in milliseconds (default: 30000).
   * @param opts.env Key-value pairs of environment variables to inject.
   * @param opts.stdin Input string, buffer, or ReadableStream piped to stdin.
   */
  export function exec(
    cmd: string,
    opts?: {
      throw?: boolean
      trim?: boolean
      timeout?: number
      env?: Record<string, string>
      stdin?: ReadableStream<Uint8Array | string> | Uint8Array | string
    }
  ): Promise<ShellResult<string>>

  /**
   * Runs a shell command and returns stdout as raw Uint8Array bytes.
   * Requires `shell.run:<command>` permission. `*` matches any characters (e.g. `shell.run:bash *`).
   *
   * @param cmd Shell command to execute
   * @param opts Option object to configure shell execution
   * @param opts.throw Throw a ShellError on non-zero exit codes (default: true).
   * @param opts.timeout Timeout in milliseconds (default: 30000).
   * @param opts.env Key-value pairs of environment variables to inject.
   * @param opts.stdin Input string, buffer, or ReadableStream piped to stdin.
   */
  export function execBinary(
    cmd: string,
    opts?: {
      throw?: boolean
      timeout?: number
      env?: Record<string, string>
      stdin?: ReadableStream<Uint8Array | string> | Uint8Array | string
    }
  ): Promise<ShellResult<Uint8Array>>

  interface ShellResult<T extends string | Uint8Array = string> {
    /**
     * The standard output (stdout) of the process.
     * For `exec` this is a string; for `execBinary` this is a `Uint8Array`.
     */
    stdout: T
    /** The standard error (stderr) of the process (always a string). */
    stderr: string
    /** The exit status code of the process. */
    exitCode: number
    /** Helper property: true if exitCode is 0, false otherwise. */
    ok: boolean
  }

  /**
   * Spawns an interactive shell session, yielding text chunks on stdout and stderr.
   * Requires `shell.run:<command>` permission. `*` matches any characters (e.g. `shell.run:npm *`).
   *
   * @param cmd Shell command to spawn
   * @param opts Option object to configure interactive execution
   * @param opts.env Key-value pairs of environment variables to inject.
   * @param opts.signal AbortSignal to kill the session and its child process tree.
   */
  export function spawn(
    cmd: string,
    opts?: {
      env?: Record<string, string>
      signal?: AbortSignal
    }
  ): ShellSession<string>

  /**
   * Spawns an interactive shell session, yielding raw Uint8Array chunks on stdout.
   * stderr always yields string chunks regardless of binary mode.
   * Requires `shell.run:<command>` permission. `*` matches any characters (e.g. `shell.run:npm *`).
   *
   * @param cmd Shell command to spawn
   * @param opts Option object to configure interactive execution
   * @param opts.env Key-value pairs of environment variables to inject.
   * @param opts.signal AbortSignal to kill the session and its child process tree.
   */
  export function spawnBinary(
    cmd: string,
    opts?: {
      env?: Record<string, string>
      signal?: AbortSignal
    }
  ): ShellSession<Uint8Array>

  interface ShellSession<T extends string | Uint8Array = string> {
    readonly stdin: ShellSessionWritableStream
    readonly stdout: ShellSessionReadableStream<T>
    readonly stderr: ShellSessionReadableStream<string>

    on(event: 'exit', callback: (code: number) => void): void
    on(event: 'error', callback: (err: string) => void): void

    /** Start the subprocess. Handlers registered before open() are guaranteed to receive all output. */
    open(): void
    kill(signal?: string): void
  }

  interface ShellSessionWritableStream extends WritableStream<Uint8Array | string> {
    write(text: string | Uint8Array): void
    end(): void
  }

  interface ShellSessionReadableStream<T extends string | Uint8Array = string> extends ReadableStream<T> {
    on(event: 'data', callback: (chunk: T) => void): void
    on(event: 'end', callback: () => void): void
  }

  namespace job {
    /**
     * Starts a background shell job with log-backed stdout/stderr.
     * On Unix, spawns with `detached: true` (process group leadership for group kill).
     * On Windows, spawns with `detached: false` and `windowsHide: true` (tree kill via `taskkill /F /T`).
     * Requires `shell.job.start:<command>` permission. `*` matches any characters (e.g. `shell.job.start:bash *`).
     *
     * When `repl: true`, the job's stdin is backed by a `stdin.log` file.
     * Use `shell.job.write(id, text)` and `shell.job.writeEof(id)` to send input.
     */
    function start(cmd: string, opts?: { env?: Record<string, string>; repl?: boolean }): Promise<{ id: string }>
    /** Sends a signal to a background shell job. Requires `shell.job.kill` permission. */
    function kill(id: string, signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT' | 'SIGHUP' | 'SIGUSR1' | 'SIGUSR2'): Promise<void>
    /** Returns true if the background shell job is still running. Requires `shell.job.exists` permission. */
    function exists(id: string): Promise<boolean>
    /** Reads raw stdout log content as written so far. Requires `shell.job.read` permission. */
    function stdout(id: string): Promise<string>
    /** Reads raw stderr log content as written so far. Requires `shell.job.read` permission. */
    function stderr(id: string): Promise<string>
    /**
     * Appends a raw text line to the job's stdin log.
     * The job process tails the log and receives the line on its stdin.
     * Only works when the job was started with `repl: true`.
     * Requires `shell.job.write` permission.
     */
    function write(id: string, text: string): Promise<void>
    /**
     * Appends the EOF sentinel to the job's stdin log, closing its stdin.
     * Only works when the job was started with `repl: true`.
     * Requires `shell.job.write` permission.
     */
    function writeEof(id: string): Promise<void>
  }
}
