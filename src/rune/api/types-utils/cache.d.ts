/** Persistent key-value cache backed by JSON files, scoped to a location and name */
declare namespace cache {
  /**
   * Opens (or creates) a named cache. Returns a handle with set/get/delete/clear/has.
   *
   * The `location` controls where the cache data is stored. Use a `@`-prefixed scope alias
   * (recommended) or a relative path for a custom location inside the project.
   *
   * The permission token format is `cache.read:<location>::<name>` for reads and
   * `cache.write:<location>::<name>` for writes. Use `/**` as a wildcard name when
   * declaring permissions in `config.json` (e.g. `cache.read:@local-project-cache/**`).
   *
   * @param location Storage scope:
   *   - `@local-project-cache` — stored per-project under the local project directory. **Most common choice for project runes.**
   *   - `@local-project-plugin-cache` — stored per-project, namespaced to the current plugin. Use when the rune is distributed as a plugin.
   *   - `@global-project-cache` — stored globally, keyed by project identity. Persists across working directory changes.
   *   - `@global-plugin-cache` — stored globally, shared across all projects for this plugin.
   *   - `@global-project-plugin-cache` — stored globally, per-project per-plugin combination.
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
