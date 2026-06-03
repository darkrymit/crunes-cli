---
tags: [module]
---
# cache

> Rune-visible cache store: named key/value buckets backed by individual JSON files, with a central registry at `~/.crunes/cache.json`.

**Source:** `src/cache/`
**Related:** [[modules/store]], [[modules/rune]], [[modules/project]]

## Overview

Runes that need to store intermediate results or memoize expensive operations use the cache module. A rune opens a named bucket and gets back a simple key/value interface. Each cache entry is a JSON file, not a single monolithic database. This design eliminates read-modify-write races — when multiple runes access the same bucket simultaneously, each entry is its own atomic transaction.

The registry tracks all buckets that have ever been created. It records metadata like when each bucket was last accessed and where it lives on disk. When a rune deletes a bucket, the directory is removed but the registry entry persists until explicitly deregistered.

## Concepts

**Bucket naming and uniqueness:** Runes open buckets by name. Two different projects might both use a bucket called "timestamps." To prevent data collisions, each bucket's on-disk key includes a hash suffix derived from the bucket's resolved location. This ensures that even if two projects use the same name, their data stays separate on disk.

**Expiration via timestamps:** Each cache entry stores an expiration timestamp. Entries with no expiration timestamp persist indefinitely. Entries with an expiration timestamp in the past are considered stale. The clear operation removes only stale entries — permanent entries survive. This means permanent entries cannot be removed with clear; you must explicitly delete them with an unset operation or delete the entire bucket.

**Five storage scopes:** Buckets can be stored in different locations depending on their scope. Global buckets live under the home directory. Project-local buckets live under the project's local config directory. Similarly, buckets can be scoped to plugins. The scope determines the filesystem location, and thus which data persists across projects and which is isolated per project.

**Prefix-based bucket resolution:** The registry maps bucket names to their full keys. When a rune refers to a bucket by name or partial key, the system tries an exact match first, then a prefix match. If zero or multiple buckets match the prefix, an error is raised. This allows short identifiers when they are unambiguous.

## Key Decisions

**One JSON file per entry:** Storing each entry as its own file eliminates the need for locking or transactions when multiple runes access the same bucket. Each rune's write to its own entry is atomic. The alternative — a single JSON file per bucket — would require read-modify-write and risk corruption under concurrent access.

**Passive expiration only:** Expired entries are not removed automatically. They accumulate until clear is explicitly run. There is no background daemon sweeping the cache and removing stale entries. This keeps the system simple — the only time anything touches the cache is when a rune or the CLI explicitly operates on it.

## Gotchas & Debugging

**Registry persists after directory deletion:** If the cache directory is manually deleted, the registry file still lists those buckets. Running "cache list" shows buckets that no longer exist. Use the delete command to deregister cleanly rather than deleting directories by hand. Otherwise the registry becomes out of sync with the filesystem.

**Missing bucket directory is treated as empty:** If clear is run on a bucket whose directory has been deleted, the operation succeeds and reports zero entries removed. ENOENT is silently swallowed. The system treats a missing directory as an empty cache, not an error condition. This is by design — it makes cleanup operations safe to run even if the directory has already been deleted.

**Permanent entries survive clear operations:** The presence of permanent entries (expiration timestamp null) in a bucket means clear will not remove them. Developers expecting a full wipe must use delete to remove the bucket entirely. If only some entries should be removed, they must be explicitly unset.

**Scope determines data lifetime:** A bucket scoped to a project disappears when the project's local config directory is deleted, but a globally-scoped bucket persists across project deletions. The scope decision is permanent once the bucket is created — moving a bucket from one scope to another requires creating a new bucket and copying the data.
