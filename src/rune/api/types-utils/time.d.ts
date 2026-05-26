/** Time utilities for rune execution */
declare namespace time {
  /**
   * Resolves after `ms` milliseconds — bridged to host-side setTimeout,
   * since the isolate has no global setTimeout.
   *
   * Always `await` this call; omitting `await` returns an unresolved Promise
   * and execution continues immediately.
   *
   * @example
   * await time.after(5_000) // pause for 5 seconds
   */
  function after(ms: number): Promise<void>
}
