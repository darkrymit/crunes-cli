---
tags: [module]
---
# store

> Centralised path helpers for the crunes store directory (`~/.crunes/` or `$CRUNES_STORE`).

**Source:** `src/store/`
**Related:** [[modules/job]], [[modules/project]], [[modules/cache]], [[modules/sqlite]], [[modules/plugin]], [[modules/marketplace]]

## Overview

Every module that needs to know where to store data imports path helpers from this module rather than computing those paths independently. This single point of abstraction means that if the directory layout ever changes, the fix lives in one place — all consumers automatically adapt without modification.

The store location itself is configurable. In production it lives under the user's home directory. In tests it gets redirected to a temporary directory. This mechanism is not merely convenient — it is foundational to how tests stay isolated. Without it, every test would need to carefully mock the filesystem or manually clean up after itself. Instead, tests simply switch the root path and operate in complete isolation.

## Concepts

**Path resolution with environment override:** The store consults an environment variable before falling back to the default location. Tests set this variable at the start and unset it at the end. This is so central to test reliability that every test suite follows this pattern. Any module that computes store paths independently and ignores the override breaks test isolation — a test failure then pollutes the user's actual home directory, and subsequent test runs have stale data from the previous failure.

**Selective directory creation:** Only two directories are created during initialization. All others are created when first written by the modules that own them. If a directory does not exist, it simply means that feature has never been used. This laziness keeps the store clean and makes it obvious which features have been exercised.

**Bucket keys include a suffix for uniqueness:** When multiple projects each use a cache or database with the same name, their on-disk identifiers differ because each key's hash is derived from the storage scope and bucket name. `local` scope hashes just the name; `local-plugin` and `global-plugin` scopes also include the pluginId. This means two different plugins can safely both use a bucket named "data" — the keys will differ, data stays separate, and no application code needs to worry about collisions.

## Key Decisions

**Centralize path computation:** All path logic lives in one module so that future changes to the storage structure require editing only one place. If a decision is made to reorganize by date, add versioning, or change directory names, the change propagates automatically to all consumers. This is why modules call a path helper rather than hardcoding paths inline.

**Environment-based isolation for testing:** Rather than building mock filesystems or requiring intricate test setup, the test suite simply points the store at a temporary directory via environment variable. The mechanism is so lightweight and reliable that it has become the standard pattern across all tests.

## Gotchas & Debugging

**Directories do not exist until needed:** Reading from a subdirectory that has never been written to fails with "directory not found." This is not an error condition — it simply indicates that the feature has never been used. Code that reads or lists subdirectories must check for existence first or treat missing directories as "no data."

**Initialization does not create all directories:** Many developers expect that initialization creates all subdirectories. It creates only two — the entry points for plugin and marketplace operations. Other directories are created on first write by their owning modules. Code that assumes a directory exists before its module writes to it will fail. Either create the directory yourself or rely on the module to create it.

**Suffix-based uniqueness protects against name collisions:** The mechanism that prevents two buckets from colliding relies on the hash suffix in each key. `local` scope keys hash only the bucket name, so the same name in the same scope always resolves to the same key — isolation is achieved by directory structure (each project's local data lives inside its own `.crunes/` directory). `local-plugin` and `global-plugin` keys additionally hash the pluginId, so different plugins cannot accidentally share data even with identical bucket names.
