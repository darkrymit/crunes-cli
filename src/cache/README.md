# cache

Rune-visible cache store: named key/value buckets backed by individual JSON files, with a central registry at `~/.crunes/cache.json`. Full docs: `docs/knowledge-base/modules/cache.md`

## Files

- **index.js** — Path helpers: `getCachePluginDir(pluginId)`, `getCacheProjectDir(key)`, `getCacheProjectPluginDir(key, pluginId)`. Registry: `loadCacheBuckets()`, `upsertCacheBucket(resolvedPath, opts)`, `listCacheBuckets(projectKey?)`, `listLocalCacheBuckets(projectDir)`, `resolveKey(id, buckets)`. Mutations: `clearCacheBucket(id, projectKey?)` — removes expired keys. `deleteCacheKey(id, keyName, projectKey?)` — deletes a single key. `deleteCacheBucket(id, projectKey?)` — deletes an entire bucket.
- **commands/list.js** — `handler({ projectDir, global, plugin })` — lists cache buckets with optional filtering by project or plugin.
- **commands/clear.js** — `handler({ id, projectDir, global })` — clears expired keys from a cache bucket.
- **commands/delete.js** — `handler({ id, yes, projectDir, global })` — deletes a cache bucket with confirmation.
- **commands/unset.js** — `handler({ id, key, projectDir, global })` — deletes a specific key from a cache bucket.

## Related Modules

- `store` — `getCachesBasePath()` and `getCacheJsonPath()` resolve bucket and registry paths. `storage-key.js` generates scoped storage keys.
- `rune` — `api/cache.js` calls `upsertCacheBucket` when runes open a cache handle.
- `project` — `ensureProjectIdentity` and `upsertProject` are called when registering new cache buckets.
