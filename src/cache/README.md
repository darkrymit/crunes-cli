# cache

Rune-visible cache store: named key/value buckets backed by individual JSON files, with a central registry at `~/.crunes/cache.json`. Full docs: `docs/knowledge-base/modules/cache.md`

## Files

- **index.js** — Path helpers: `getCachePluginDir(pluginId)`. Registry: `loadCacheBuckets()`, `upsertCacheBucket(resolvedPath, opts)`, `listCacheBuckets()`, `listLocalCacheBuckets(projectDir)`, `resolveKey(id, buckets)`. Mutations: `clearCacheBucket(id)` — removes expired keys. `deleteCacheKey(id, keyName)` — deletes a single key. `deleteCacheBucket(id)` — deletes an entire bucket.
- **commands/list.js** — `handler({ projectDir, plugin })` — lists cache buckets with optional plugin filter.
- **commands/clear.js** — `handler({ id, projectDir })` — clears expired keys from a cache bucket.
- **commands/delete.js** — `handler({ id, yes, projectDir })` — deletes a cache bucket with confirmation.
- **commands/unset.js** — `handler({ id, key, projectDir })` — deletes a specific key from a cache bucket.

## Related Modules

- `store` — `getCacheBasePath()` and `getCacheJsonPath()` resolve bucket and registry paths. `storage-key.js` generates scoped storage keys.
- `rune` — `api/cache.js` calls `upsertCacheBucket` when runes open a cache handle.
