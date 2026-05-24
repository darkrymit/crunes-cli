---
tags: [module]
---
# cache

> Rune-visible cache store: named key/value buckets backed by individual JSON files.

**Source:** `src/cache/`
**Related:** [[modules/store]], [[modules/rune]]

## Overview

Runes call `utils.cache.open(location, name)` to get a typed bucket handle. Each bucket is a directory under `~/.crunes/caches/`. Individual cache entries are JSON files named `<key>.json`. The registry (`cache.json`) tracks all known buckets with their metadata.

## Concepts

**Bucket key format:** `<name>-<12-char-sha256-of-resolved-path>`. E.g. a bucket named `timestamps` whose resolved path hashes to `70db7051979d` gets key `timestamps-70db7051979d`. The hash makes bucket keys globally unique even if two projects use the same bucket name.

**TTL semantics:** Each entry JSON has an `expiresAt` field. `expiresAt: null` = permanent (never expires). `expiresAt: <ms-since-epoch>` = expires after that timestamp. `clearCacheBucket` removes only entries where `expiresAt !== null && Date.now() > expiresAt`. Permanent entries survive `clear` — only `delete` (whole bucket) or `unset` (single key) removes them.

**Prefix resolution:** `resolveKey(id, buckets)` matches against the object keys in `cache.json`. Exact match first, then `startsWith`. Same ambiguity/no-match error pattern as sqlite and job.

**Scope model:** Each bucket has a `scope` field: `global`, `project`, `plugin`, or `project-plugin`. Scopes map to subdirectories under `caches/`:
- `global` → `caches/global/<name>/`
- `project` → `caches/projects/<projectKey>/<name>/`
- `plugin` → `caches/plugins/<pluginId>/<name>/`
- `project-plugin` → `caches/project-plugins/<projectKey>/<pluginId>/<name>/`

## Key Decisions

- **One file per cache entry:** Same rationale as jobs — avoids read-modify-write races when multiple rune processes write to the same bucket.

- **Passive GC only:** Expired entries accumulate until `cache clear <id>` is run. There is no background sweeper — the CLI is not a daemon.

## Gotchas & Debugging

- **`cache.json` persists after manual directory deletion:** If you `rm -rf ~/.crunes/caches/`, the registry still has stale entries. Use `crunes cache delete <id>` to deregister cleanly.

- **`clearCacheBucket` returns `{ removed: 0 }` when the directory is missing:** ENOENT is silently swallowed. A missing bucket directory is treated as empty, not an error.
