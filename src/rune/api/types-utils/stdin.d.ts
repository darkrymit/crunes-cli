/**
 * @module stdin
 *
 * Read piped standard input from a single-invocation `run` rune.
 * No permission grant is required; returns `null` when stdin is a TTY
 * or when invoked from `repl`, `batch`, or `args`.
 */

declare namespace stdin {
  /** `true` when stdin is an interactive TTY or unavailable (e.g. `repl`/`batch`). */
  export const isTTY: boolean

  /**
   * Reads piped stdin as a UTF-8 string, or `null` when `isTTY` is `true`.
   * Cached per run; throws `RangeError` if input exceeds `maxBytes` (default: 10 MiB).
   */
  export function read(opts?: { maxBytes?: number }): Promise<string | null>

  /**
   * Reads piped stdin as raw bytes, or `null` when `isTTY` is `true`.
   * Cached per run; throws `RangeError` if input exceeds `maxBytes` (default: 10 MiB).
   */
  export function readBytes(opts?: { maxBytes?: number }): Promise<Uint8Array | null>
}
