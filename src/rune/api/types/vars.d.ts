/** Read rune-scoped variables defined in config.json under runes.<key>.vars */
declare namespace vars {
  /**
   * Returns the value of a rune variable, or fallback if absent.
   * @param key Variable name
   * @param fallback Default value
   */
  function get(key: string, fallback?: unknown): unknown

  /**
   * Returns true if the variable is defined in the rune config.
   * @param key Variable name
   */
  function has(key: string): boolean
}
