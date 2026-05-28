/** Create and emit context sections from a rune */
declare namespace section {
  /**
   * Creates a section object to be returned or emitted by a rune.
   *
   * @param name   Unique section identifier used for filtering.
   * @param data   Section payload: `{ type: 'markdown', content: string }` or `{ type: 'tree', root: object }`.
   * @param opts   Optional metadata: `title` (display label) and `attrs` (key/value attributes).
   * @returns A section object ready to be returned or passed to `emit`.
   */
  export function create(
    name: string,
    data: { type: 'markdown'; content: string } | { type: 'tree'; root: object },
    opts?: { title?: string; attrs?: Record<string, string> }
  ): RuneSection

  /**
   * Progressively emits a section during rune execution, before the rune returns.
   * Use this to stream partial results to the consumer in real time.
   *
   * @param section A section created with `section.create(...)`.
   */
  export function emit(section: RuneSection): void

  /**
   * Tests whether a section name matches one or more glob patterns.
   *
   * @param sectionName The section name to test.
   * @param patterns    One or more glob patterns (e.g. `['result*', 'summary']`).
   * @returns `true` if the name matches any pattern.
   */
  export function match(sectionName: string, patterns: string[]): boolean

  /**
   * Returns the active section filter passed via `--section` (or `-s`), or `undefined` if none.
   */
  export function selected(): string | undefined

  /** Minimal section shape created by `section.create` and accepted by `section.emit`. */
  interface RuneSection {
    name: string
    data: { type: string; content?: string; root?: object }
    title?: string
    attrs?: Record<string, string>
  }
}
