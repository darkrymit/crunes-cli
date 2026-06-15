/** Persistent key-value cache backed by JSON files, scoped to a location and name */
declare namespace cache {
  /**
   * Opens (or creates) a named cache. Returns a handle with set/get/delete/clear/has.
   *
   * The `location` controls where the cache data is stored. Use a `@`-prefixed scope alias
   * (recommended) or a relative path for a custom location inside the project.
   *
   * The permission token format is `cache.read:<location>::<name>` for reads and
   * `cache.write:<location>::<name>` for writes. In the location part, `*` stops at `/` and `**` spans
   * path segments (e.g. `cache.read:@local-cache/**`). In the name part, `*` matches any characters
   * (e.g. `cache.read:@local-cache/**::my-*`).
   *
   * @param location Storage scope:
   *   - `@local-cache` — stored under `.crunes/cache/project/` in the local project directory. **Most common choice for project runes.**
   *   - `@local-plugin-cache` — stored under `.crunes/cache/plugins/<id>/`, namespaced to the current plugin. Use when the rune is distributed as a plugin.
   *   - `@global-plugin-cache` — stored globally under `~/.crunes/cache/plugins/<id>/`, shared across all projects for this plugin.
   *   - A relative path string — stored at a custom path inside the project directory.
   * @param name Cache name within the scope (default: "default")
   */
  function open(location: string, name?: string): Promise<CacheHandle>

  interface CacheHandle {
    /**
     * Store a value. ttl is time-to-live in seconds.
     * Requires `cache.write:<location>::<name>` permission.
     */
    set(key: string, value: unknown, ttl?: number): Promise<void>
    /**
     * Retrieve a value, or null if absent or expired.
     * Requires `cache.read:<location>::<name>` permission.
     */
    get(key: string): Promise<unknown>
    /**
     * Delete a single entry.
     * Requires `cache.write:<location>::<name>` permission.
     */
    delete(key: string): Promise<void>
    /**
     * Delete all entries in this cache.
     * Requires `cache.write:<location>::<name>` permission.
     */
    clear(): Promise<void>
    /**
     * Returns true if the key exists and has not expired. Does not return the value.
     * Requires `cache.read:<location>::<name>` permission.
     */
    has(key: string): Promise<boolean>
  }
}
