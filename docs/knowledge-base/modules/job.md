---
tags: [module]
---
# job

> Background job tracking: create, list, kill, and garbage-collect rune-spawned processes.

**Source:** `src/job/`
**Related:** [[modules/store]], [[modules/project]], [[modules/rune]]

## Overview

Jobs track long-running rune-spawned processes. Each job is a JSON file written to `~/.crunes/jobs/project/<projectKey>/<uuid>.json`. The registry has no database — just one file per job. Listing is a directory scan; cleanup is lazy (triggered on every `jobs list`).

## Concepts

**projectKey:** SHA-256 of the project directory path, hex-encoded, sliced to 12 chars. `projectKey('/home/user/myproject')` produces something like `'a3f8d2c019b7'`. Used as a stable short identifier that does not leak the full path in filenames.

**isAlive:** Uses `process.kill(pid, 0)` — signal 0 is an existence check that sends no actual signal. Returns `true` if the OS reports the PID is live. On Windows, this always returns `false` for foreign processes, so all jobs appear dead on Windows.

**cleanJobs:** Scans job files, calls `isAlive` on each PID, and removes records for dead PIDs. Only runs on `job list` (lazy GC). Dead jobs accumulate between list calls but do not affect functionality — `kill` fails gracefully if a record is stale.

**resolveJobId:** Prefix-match resolution on job UUID. Exact match first, then `startsWith`. Since UUIDs are 36-char hex strings, 8 chars is practically unique. Zero matches or multiple matches both throw with descriptive messages. Allows `crunes job kill abc12345` instead of the full UUID.

## Key Decisions

- **One file per job, no index:** Avoids write-concurrency issues when multiple rune processes spawn jobs simultaneously. A single `jobs.json` would require read-modify-write and risk corruption under concurrent spawns.

- **Lazy GC on list:** `cleanJobs` is called inside the list handler before returning results. A crash or `kill -9` leaves a stale record that disappears on next `crunes job list`.

- **`projectDir: null` is valid:** Jobs spawned from a non-project context may have `projectDir: null`. These appear in `--global` listing with `-` in the PROJECT column.

## Gotchas & Debugging

- **Dead job records after process crash:** If a rune process is killed with SIGKILL, its job record is never cleaned by the process itself. Run `crunes job list` to trigger cleanup, or delete `~/.crunes/jobs/` manually.

- **PID reuse false positive:** On a heavily loaded system, a dead job's PID might be reused by a different process. `isAlive` returns `true` for that record even though the original job is gone. There is no way to distinguish without storing additional metadata.
