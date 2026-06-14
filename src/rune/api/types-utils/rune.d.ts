/** Inter-rune call utilities */
declare namespace rune {
  /**
   * Calls another rune as a subprocess and awaits completion.
   * Hard process boundary — safe for cross-author/plugin rune composition.
   * Requires `rune.run:<key>` permission. `*` matches any characters (e.g. `rune.run:myplugin:*`).
   */
  function exec(key: string, args?: string[]): Promise<RuneResult>

  /**
   * Spawns a rune as a streaming subprocess session.
   * Returns immediately with live stdout/stderr streams.
   * Requires `rune.run:<key>` permission. `*` matches any characters (e.g. `rune.run:myplugin:*`).
   */
  function spawn(key: string, args?: string[]): RuneSession

  /** Result returned by rune.exec() */
  interface RuneResult {
    sections: RuneSection[]
    stdout: string
    stderr: string
    exitCode: number
    ok: boolean
  }

  interface RuneSessionReadableStream extends ReadableStream<string> {
    on(event: 'data', callback: (chunk: string) => void): void
    on(event: 'end', callback: () => void): void
  }

  /** Streaming session returned by rune.spawn() */
  interface RuneSession {
    readonly stdout: RuneSessionReadableStream
    readonly stderr: RuneSessionReadableStream
    on(event: 'exit', callback: (code: number) => void): void
    on(event: 'error', callback: (err: string) => void): void
    /** Start the subprocess. Handlers registered before open() are guaranteed to receive all output. */
    open(): void
    kill(signal?: string): void
  }


  namespace job {
    /**
     * Starts a rune as a detached background job with log-backed stdout/stderr.
     * Survives parent process exit. Requires `rune.job.start:<key>` permission. `*` matches any characters.
     */
    function start(key: string, args?: string[]): Promise<{ id: string }>

    /**
     * Sends a signal to a background rune job.
     * Requires `rune.job.kill` permission.
     */
    function kill(id: string, signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT' | 'SIGHUP' | 'SIGUSR1' | 'SIGUSR2'): Promise<void>

    /**
     * Returns true if the background rune job is still running.
     * Requires `rune.job.exists` permission.
     */
    function exists(id: string): Promise<boolean>

    /**
     * Reads raw stdout log file content as written so far (live, works while running).
     * Requires `rune.job.read` permission.
     */
    function stdout(id: string): Promise<string>

    /**
     * Reads raw stderr log file content as written so far.
     * Requires `rune.job.read` permission.
     */
    function stderr(id: string): Promise<string>

    /**
     * Parses stdout JSONL log and returns sections emitted so far.
     * Works while running — returns whatever has been written.
     * Requires `rune.job.read` permission.
     */
    function sections(id: string): Promise<RuneSection[]>
  }
}
