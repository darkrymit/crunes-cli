---
type: module
title: cache
description: Named key/value buckets where every entry is its own JSON file, so concurrent runes never contend, with passive expiry that only a clear operation acts on.
tags: [module, cache, storage]
resource: src/cache/
---

# cache

Buckets a rune opens by name to memoise work or hold intermediate results. A registry at `<store>/cache.json` records every bucket ever created, its scope and its last access.

## One file per entry

Each entry is a separate JSON file rather than a key inside one bucket file. Two runes writing different keys in the same bucket touch different files, so there is no read-modify-write and no lock — the concurrency problem is removed rather than managed.

The cost is many small files instead of one, which is the right trade for a store whose entries are individually tiny and written from independent processes.

## Scopes decide lifetime

| Scope | Location |
|---|---|
| `local` | `.crunes/cache/project/` |
| `local-plugin` | `.crunes/cache/plugins/<pluginId>/` |
| `global-plugin` | `<store>/cache/plugins/<pluginId>/` |

A project-scoped bucket dies with the project's `.crunes/`; a global plugin bucket outlives every project. **The scope is fixed at creation** — moving a bucket between scopes means creating a new one and copying.

Bucket keys carry a hash so identical names cannot collide across scopes; the rule is in [store](/modules/store.md).

## Expiry is passive

An entry stores an expiry timestamp, or none. Nothing sweeps: expired entries sit there until a `clear` runs, and `clear` removes **only** expired ones.

There is no background daemon, and that is the point — the cache is touched only when a rune or the CLI explicitly touches it, so nothing runs on a schedule the user did not ask for.

## Gotchas

**Permanent entries survive `clear`.** An entry with no expiry is never removed by `clear`. Expecting a full wipe requires `unset` per key, or deleting the bucket.

**The registry outlives the directory.** Deleting a cache directory by hand leaves its registry entry, so `cache list` shows buckets that no longer exist. Use the delete command to deregister cleanly.

**A missing bucket directory reads as empty.** `clear` on a bucket whose directory is gone succeeds and reports zero removed; ENOENT is swallowed deliberately so cleanup is safe to run twice.
