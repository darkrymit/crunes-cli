/** Run shell commands from the project directory */
declare namespace shell {
  /**
   * Runs a shell command asynchronously and returns its output.
   * Requires `shell.exec:<command>` permission.
   *
   * @param cmd Shell command to execute
   * @param opts Option object to configure shell execution
   * @param opts.throw Throw a ShellError on non-zero exit codes (default: true). If false, returns the result object.
   * @param opts.trim Trim leading/trailing whitespace from stdout (default: true).
   * @param opts.timeout Timeout in milliseconds (default: 30000).
   * @param opts.env Key-value pairs of environment variables to inject.
   * @param opts.stdin Input string, buffer, or ReadableStream piped to stdin.
   * @param opts.binary Return stdout as raw Uint8Array instead of string (default: false).
   */
  export function exec(
    cmd: string, 
    opts?: { 
      throw?: boolean
      trim?: boolean
      timeout?: number
      env?: Record<string, string>
      stdin?: ReadableStream<Uint8Array | string> | Uint8Array | string
      binary?: boolean
    }
  ): Promise<ShellResult>

  interface ShellResult {
    /** 
     * The standard output (stdout) of the process. 
     * If `opts.binary` is true, this is a `Uint8Array`; otherwise, a string.
     */
    stdout: string | Uint8Array
    /** The standard error (stderr) of the process (always a string). */
    stderr: string
    /** The exit status code of the process. */
    exitCode: number
    /** Helper property: true if exitCode is 0, false otherwise. */
    ok: boolean
  }

  /**
   * Spawns an interactive shell session, allowing progressive streaming and real-time stdin/stdout interaction.
   * Requires `shell.exec:<command>` permission.
   *
   * @param cmd Shell command to spawn
   * @param opts Option object to configure interactive execution
   * @param opts.env Key-value pairs of environment variables to inject.
   * @param opts.signal AbortSignal to kill the session and its child process tree.
   * @param opts.binary Stream stdout/stderr chunks as Uint8Array instead of string (default: false).
   */
  export function execInSession(
    cmd: string, 
    opts?: { 
      env?: Record<string, string>
      signal?: AbortSignal
      binary?: boolean
    }
  ): ShellSession

  interface ShellSession {
    readonly stdin: HybridWritableStream
    readonly stdout: HybridReadableStream
    readonly stderr: HybridReadableStream
    
    on(event: 'exit', callback: (code: number) => void): void
    on(event: 'error', callback: (err: string) => void): void
    
    kill(signal?: string): void
  }

  interface HybridWritableStream extends WritableStream<Uint8Array | string> {
    write(text: string | Uint8Array): void
    end(): void
  }

  interface HybridReadableStream extends ReadableStream<Uint8Array | string> {
    on(event: 'data', callback: (chunk: string | Uint8Array) => void): void
    on(event: 'end', callback: () => void): void
  }
}

