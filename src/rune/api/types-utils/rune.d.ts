/** Inter-rune call utilities and self-inspection */
declare namespace rune {
  /** Returns the current rune's key (e.g. 'my-rune' or 'myplugin:my-rune'). null in bootstrap contexts. */
  function key(): string | null

  /** Returns the formatted CLI help text for the current rune. Empty string if no args schema. */
  function helpText(): string

  /** Creates a markdown section containing the formatted CLI help text. */
  function helpSection(): RuneSection

  /**
   * Returns the raw arg schema object for the current rune.
   * Source is args() during run lifecycle, argsRepl() during repl lifecycle.
   * null if the rune exports no args/argsRepl function.
   */
  function argsSchema(): ArgSchema | null

  /**
   * Returns the raw commandsRepl schema for the current rune.
   * null during run lifecycle or if commandsRepl() is not exported.
   */
  function commandsSchema(): CommandSchema[] | null

  /** Root-level arg schema — no name or description (those belong to CommandSchema). */
  interface ArgSchema {
    options:     { flags: string; description: string; def?: any }[]
    positionals: { spec: string; description: string }[]
    examples:    { usage: string; description: string }[]
    commands:    CommandSchema[]
  }

  /** Subcommand schema — extends ArgSchema with name and description. */
  interface CommandSchema extends ArgSchema {
    name:        string
    description: string
  }


  /**
   * Calls another rune as a subprocess and awaits completion.
   * Hard process boundary — safe for cross-author/plugin rune composition.
   * Requires `rune.run:<key>` permission (or `rune.repl:<key>` when `repl: true`).
   * `*` matches any characters (e.g. `rune.run:myplugin:*`).
   *
   * When `repl: true`, `opts.stdin` is written to the child's stdin before awaiting exit.
   */
  function exec(key: string, args?: string[], opts?: { repl?: boolean; stdin?: string }): Promise<RuneResult>

  /**
   * Spawns a rune as a streaming subprocess session.
   * Returns immediately with live stdout/stderr streams.
   * Requires `rune.run:<key>` permission (or `rune.repl:<key>` when `repl: true`).
   * `*` matches any characters (e.g. `rune.run:myplugin:*`).
   *
   * When `repl: true`, the returned session exposes `write()`, `writeEof()`,
   * `writeInterrupt()`, and `stdin.write()` for interactive communication.
   */
  function spawn(key: string, args?: string[], opts?: { repl?: boolean }): RuneSession

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
    /** Sends a JSONL `{"type":"line","text":"..."}` event to the child's stdin. Repl mode only. */
    write(text: string): void
    /** Sends a JSONL `{"type":"eof","text":""}` event to the child's stdin, signalling end of input. Repl mode only. */
    writeEof(): void
    /** Sends a JSONL `{"type":"interrupt","text":""}` event to the child's stdin. Repl mode only. */
    writeInterrupt(): void
    /** Raw stdin access — write arbitrary bytes directly to the child process stdin. Repl mode only. */
    readonly stdin: { write(chunk: string | Uint8Array): void }
  }


  namespace job {
    /**
     * Starts a rune as a detached background job with log-backed stdout/stderr.
     * Survives parent process exit. Requires `rune.job.start:<key>` permission (or `rune.repl:<key>` when `repl: true`).
     * `*` matches any characters.
     *
     * When `repl: true`, the job's stdin is backed by a `stdin.log` file.
     * Use `rune.job.write(id, text)` and `rune.job.writeEof(id)` to send input.
     */
    function start(key: string, args?: string[], opts?: { repl?: boolean }): Promise<{ id: string }>

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

    /**
     * Appends a JSONL `{"type":"line","text":"..."}` event to the job's stdin log.
     * The job process tails the log and receives the line on its stdin.
     * Only works when the job was started with `repl: true`.
     * Requires `rune.job.write` permission.
     */
    function write(id: string, text: string): Promise<void>

    /**
     * Appends a JSONL `{"type":"eof","text":""}` event to the job's stdin log, closing its stdin.
     * Only works when the job was started with `repl: true`.
     * Requires `rune.job.write` permission.
     */
    function writeEof(id: string): Promise<void>
  }
}
