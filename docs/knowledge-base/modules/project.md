---
tags: [module]
---
# project

> Reverse-lookup index from hashed project key to real project directory path.

**Source:** `src/project/`
**Related:** [[modules/store]], [[modules/job]]

## Overview

`projects.json` maps `<sha256-12-char-key> → projectDir`. The job registry writes this on `createJob` via `upsertProject`. The only consumer today is global job listing, which needs to show human-readable project paths alongside the truncated key.

## Concepts

**projects.json format:**
```json
{ "format": "1", "projects": { "a3f8d2c019b7": "/home/user/myproject" } }
```

**upsertProject is idempotent:** Writing the same key/dir pair twice is safe — it overwrites with the same value. The `format` field is always `"1"` and is reserved for future schema migration.

## Key Decisions

- **Separate from job records:** Project metadata is centralised in `projects.json` rather than derived at query time from job file paths. `crunes jobs list --global` reads one file to build the project list rather than scanning every job file.
