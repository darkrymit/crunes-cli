---
tags: [module]
---
# sqlite

> Rune-visible SQLite store: named databases registered in a central index.

**Source:** `src/sqlite/`
**Related:** [[modules/store]], [[modules/rune]]

## Overview

Runes call `utils.sqlite.open(location, name)` to open a named SQLite database handle. Each database is a `.sqlite` file under `~/.crunes/sqlite/`. The registry (`sqlite.json`) tracks all known databases with their metadata.

## Concepts

**Database key format:** `<name>-<12-char-sha256-of-resolved-path>`. Identical pattern to cache bucket keys. Globally unique even if two projects use the same database name.

**WAL/SHM sidecars:** SQLite in WAL mode writes `<db>.sqlite-wal` and `<db>.sqlite-shm` alongside the main file. `deleteSqliteDb` removes all three using `{ force: true }` so missing sidecars are silently ignored (common if the database was never opened in WAL mode).

**Readonly query mode:** `querySqliteDb` opens the database with `new Database(path, { readonly: true })`. Write statements (`INSERT`, `UPDATE`, `DELETE`, `CREATE`) throw a `better-sqlite3` error, which the query handler surfaces as `Error: <message>` + `process.exit(1)`.

**Scope model:** Same five scopes as cache (`global-project`, `global-plugin`, `global-project-plugin`, `local-project`, `local-project-plugin`), same subdirectory structure under `sqlite/`.

## Key Decisions

- **`better-sqlite3` (sync) not `sqlite3` (async):** The query command runs a single statement and exits. The synchronous API avoids callback/promise overhead for this one-shot use case. The `readonly` flag prevents accidental mutation from management commands.

## Gotchas & Debugging

- **`sqlite.json` persists after the `.sqlite` file is deleted:** Same as cache — use `crunes sqlite delete <id>` to deregister.

- **WAL sidecars left behind after process crash:** If a rune writes to a database and crashes before WAL checkpoint, the `-wal` file remains. `deleteSqliteDb` will still delete it. `querySqliteDb` in readonly mode reads through an uncommitted WAL safely.
