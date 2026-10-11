---
type: gotcha
title: A bare temp directory is rootless
description: A directory with no .crunes/config.json is not a project, so local state redirects into the store — which catches tests that create a temp directory and expect state beside it.
tags: [testing, storage, rootless]
resource: src/store/
---

# A bare temp directory is rootless

A directory without `.crunes/config.json` is not a project. Instead of refusing to run there, crunes redirects all local state into `<store>/rootless/<hash-of-cwd>/` — see [storage layers](/patterns/storage-layers.md).

A test that makes a temp directory and expects to find state under `<dir>/.crunes/` therefore finds nothing, and the operation it was testing reports success. **Write a `<dir>/.crunes/config.json` first** to make the directory a project.

This catches tests for caches, sqlite, jobs, schemas and `@local-*` permission patterns — everything whose location is decided by `getLocalBase(projectDir)`.

## The related failure

A test that does not set `CRUNES_STORE` writes into the developer's real `~/.crunes/`. Nothing fails, the test passes, and the next run starts with state the previous one left behind — which then fails for a reason that has nothing to do with the change being tested. Every test touching the store sets the variable in `beforeEach` and clears it afterwards.
