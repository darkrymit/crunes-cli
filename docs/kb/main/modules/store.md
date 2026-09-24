---
type: module
title: store
description: The single place every store path is computed, honouring CRUNES_STORE at call time and deciding through getLocalBase whether local state lands beside the project or inside the store.
tags: [module, storage, paths]
resource: src/store/
---

# store

Path helpers, and nothing else. Every module needing a location imports from here rather than joining paths itself, so a change to the layout is one edit.

The layering this serves is [storage layers](/patterns/storage-layers.md); this document is the module that implements the paths.

## Why one module rather than a convention

Centralising is not tidiness here — it is what test isolation depends on.

`getStorePath()` returns `process.env.CRUNES_STORE ?? path.join(os.homedir(), '.crunes')`, read **at call time**. Tests point the variable at a temp directory and get complete isolation with no filesystem mocking.

A module that computes a store path independently does not merely duplicate logic: during a test run it writes into the developer's real home directory, the test still passes, and the next run begins with state the previous one left behind. The failure surfaces far from its cause.

## `getLocalBase` is the rootless decision

One function decides whether local state lives at `<projectDir>/.crunes` or at `<store>/rootless/<hash-of-cwd>/`. Every consumer routes through it, so adding rootless mode required no new argument on any call chain.

The invariant: **a rootless run writes nothing outside the store.** Permission patterns and `@project/` still resolve against the working directory, which is what lets a global rune act on whatever directory invoked it while leaving nothing behind.

## Lazy directory creation

Initialisation creates two directories. Everything else is created on first write by the module that owns it, so a missing directory means *this feature has never been used* rather than *something is broken*.

## Gotchas

**Reading a never-written subdirectory fails with ENOENT.** That is not an error condition. Code listing or reading a store subdirectory must treat absence as *no data*.

**Initialisation does not create everything.** Code assuming a directory exists before its owning module has written there will fail; either create it or let the owner do it.

**A bare temp directory is rootless.** Covered in [its own gotcha](/gotchas/rootless-temp-dirs.md), because it catches tests for caches, sqlite, jobs, schemas and `@local-*` patterns alike.

**`local` scope keys hash only the bucket name.** Two projects using the same bucket name in `local` scope produce the same key — isolation comes from each project's `.crunes/` directory, not from the key. Plugin scopes additionally hash the plugin id, so two plugins cannot share a bucket by naming it the same thing.
