/** Persistent key-value cache backed by JSON files, scoped to a location and name */
declare namespace cache {
  /**
   * Opens (or creates) a named cache. Returns a handle with set/get/delete/clear.
   * @param location Storage scope: "project", "plugin", "global", or a relative path
   * @param name Cache name (default: "default")
   */
  function open(location: string, name?: string): Promise<CacheHandle>

  interface CacheHandle {
    /** Store a value. ttl is time-to-live in seconds. */
    set(key: string, value: unknown, ttl?: number): Promise<void>
    /** Retrieve a value, or null if absent or expired */
    get(key: string): Promise<unknown>
    /** Delete a single entry */
    delete(key: string): Promise<void>
    /** Delete all entries in this cache */
    clear(): Promise<void>
  }
}
