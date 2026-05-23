/** Minimal section shape returned by rune.use() */
interface RuneSection {
  name: string
  data: { type: string; content?: string; root?: object }
  title?: string
  attrs?: Record<string, string>
}

/** Inter-rune call utilities */
declare namespace rune {
  /** Calls another rune synchronously and returns its sections */
  function use(key: string, args?: string[]): Promise<RuneSection[]>

  /**
   * Starts a rune as a detached background job.
   * Returns immediately with a stable job id.
   * Requires `rune.spawn:<key>` permission.
   */
  function spawn(key: string, args?: string[]): Promise<{ id: string }>

  /**
   * Sends a signal to a background job (default: SIGTERM).
   * No-op if the job is already stopped.
   * Requires `rune.kill:<runeKey>` permission; only jobs from the same project can be targeted.
   * Valid signals: SIGTERM, SIGKILL, SIGINT, SIGHUP, SIGUSR1, SIGUSR2.
   */
  function kill(id: string, signal?: 'SIGTERM' | 'SIGKILL' | 'SIGINT' | 'SIGHUP' | 'SIGUSR1' | 'SIGUSR2'): Promise<void>

  /**
   * Returns true if the background job is still running.
   * Requires `rune.exists:<runeKey>` permission; only jobs from the same project can be checked.
   */
  function exists(id: string): Promise<boolean>

}
