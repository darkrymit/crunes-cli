# cache

Rune-visible cache store: named key/value buckets backed by individual JSON files. Full docs: `docs/knowledge-base/modules/cache.md`

## Key Files

- **index.js** — `cacheBucketKey()`, `loadCacheBuckets()`, `upsertCacheBucket()`, `listCacheBuckets()`, `resolveKey()`, `clearCacheBucket()`, `deleteCacheKey()`, `deleteCacheBucket()`. Also path helpers: `getCachePluginDir()`, `getCacheProjectDir()`, `getCacheProjectPluginDir()`.

## Sub-directories

- **commands/** — CLI handlers: `list`, `clear`, `delete`, `unset`.

## Related Modules

- `store` — `getCachesBasePath()` and `getCacheJsonPath()` resolve bucket and registry paths.
- `rune` — `api/cache.js` calls `upsertCacheBucket` when runes open a cache; `api/utils.js` imports path helpers to locate bucket directories.
