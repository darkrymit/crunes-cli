---
tags: [module]
---
# store

> Centralised path helpers for the crunes store directory (`~/.crunes/` or `$CRUNES_STORE`).

**Source:** `src/store/`
**Related:** [[modules/job]], [[modules/project]], [[modules/cache]], [[modules/sqlite]], [[modules/plugin]], [[modules/marketplace]]

## Overview

All modules that read or write to the crunes store import path helpers from `store/index.js` rather than computing paths independently. This is a single point of change if the directory layout ever shifts.

## Concepts

**CRUNES_STORE override:** `getStorePath()` returns `process.env.CRUNES_STORE ?? path.join(os.homedir(), '.crunes')`. Every test that writes to the store sets `process.env.CRUNES_STORE = tmpdir` in `beforeEach` and deletes it in `afterEach` to guarantee isolation between test runs.

**Store layout:**
```
~/.crunes/
  plugins/                        ← installed plugin code (marketplace/name/version/)
  marketplaces/                   ← cached marketplace index JSON files
  store/                          ← pnpm content-addressable store for plugin deps
  jobs/project/<12-char-key>/     ← one <uuid>.json per running job
  caches/                         ← utils.cache bucket directories
  sqlite/                         ← utils.sqlite database files
  plugins.json                    ← global plugin registry
  projects.json                   ← hash-key → projectDir reverse lookup
  cache.json                      ← cache bucket registry
  sqlite.json                     ← sqlite database registry
  marketplaces.json               ← registered marketplace sources
```

## Gotchas & Debugging

- **`ensureStoreDirs` only creates `plugins/`, `marketplaces/`, and `store/`:** Other directories (`jobs/`, `caches/`, `sqlite/`) are created on first write by the modules that own them. Do not assume any subdirectory exists before reading.
