/** Access the CLI usage text for the current rune */
declare namespace help {
  /**
   * Returns the formatted CLI help text for the current rune as a plain string.
   * Empty string if no args schema is defined.
   */
  export function text(): string

  /**
   * Creates a markdown section containing the formatted CLI help text.
   * Equivalent to `section.create('help', { type: 'markdown', content: help.text() })`.
   */
  export function section(): RuneSection
}
