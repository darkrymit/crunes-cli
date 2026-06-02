/** Persistent key-value cache backed by JSON files, scoped to a location and name */
declare namespace cache {
  /**
   * Opens (or creates) a named cache. Returns a handle with set/get/delete/clear.
   * @param location Storage scope: "@local-project-cache", "@global-project-cache", "@global-plugin-cache", "@local-project-plugin-cache", "@global-project-plugin-cache", or a relative path
   * @param name Cache name (default: "default")
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
