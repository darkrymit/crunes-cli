---
tags: [module]
---
# sqlite

> Rune-visible SQLite store: named databases registered in a central index at `~/.crunes/sqlite.json`.

**Source:** `src/sqlite/`
**Related:** [[modules/store]], [[modules/rune]], [[modules/project]]

## Overview

Runes that need structured data storage beyond simple key/value pairs use SQLite. A rune opens a named database and gets back a standard SQL interface. The registry tracks all databases, recording metadata like creation time and storage location. When databases are deleted via the CLI, the registry deregisters them but the files may persist if already deleted manually.

SQLite databases are stored as single files on disk. The database engine writes auxiliary files (WAL and checkpoint files) alongside the main file. These auxiliary files are transient — they exist only during active database usage or if a process crashed before flushing writes. They are automatically cleaned up by the next process to access the database.

## Concepts

**Database naming and uniqueness:** Like caches, databases are opened by name. Two projects might both open a database called "metadata." Each database's on-disk path includes a hash suffix derived from the database's resolved location, ensuring separation even with name collisions. The suffix is the same mechanism used for caches — globally unique keys across all projects using the same database name.

**WAL (Write-Ahead Logging) sidecars:** When SQLite operates in WAL mode, it writes two auxiliary files alongside the main database file. These files are transient — they exist while the database is active or if a crash interrupted a write. Deleting a database must remove all three files. If the auxiliary files are missing (perhaps because the database was never opened in WAL mode), the deletion still succeeds silently.

**Read-only query interface:** The CLI provides a management command to query databases in read-only mode. Write operations throw errors. This read-only restriction prevents accidental mutation of data from management commands. The implementation uses synchronous database access because the query runs once and exits — asynchronous APIs would add unnecessary overhead.

**Five storage scopes:** Like caches, databases can be global, project-local, or scoped to plugins. The scope determines where the database file lives and thus which projects see it. Global databases persist across projects; project-local databases are isolated to one project.

## Key Decisions

**Synchronous database access:** The query command uses synchronous APIs rather than promises or callbacks. The operation runs once and exits — there is no need for asynchronous concurrency. The synchronous approach is simpler and adds no overhead for this use case.

**Read-only flag on management queries:** The read-only restriction is not a security measure — it is a usability safeguard. It prevents the common mistake of running a query command that accidentally modifies data. Intentional writes go through the rune API, not through management commands.

## Gotchas & Debugging

**Registry persists after database file deletion:** If a database file is manually deleted, the registry still lists it. Running "sqlite list" shows entries for databases that no longer exist. Use the delete command to deregister cleanly. Manual file deletion causes registry/filesystem mismatch, making it hard to diagnose which databases are actually present.

**WAL sidecars left after crash:** If a rune writes to a database and crashes before WAL checkpoint, the `-wal` file remains on disk. The file is not corrupted; it just contains uncommitted writes. The next process to open the database in read mode reads through the uncommitted WAL without issue. Deleting the database or running a checkpoint will clean up the sidecar.

**Multiple simultaneous writes to the same database are serialized:** SQLite enforces write serialization at the database level. If multiple runes try to write to the same database, one will block until the other finishes. This is by design — SQLite provides the serialization guarantee. Long-running write transactions can cause other runes to wait.

**Deleting the database file does not invalidate the registry:** The registry is independent from the files. Knowing that a database is registered does not mean the file exists. Code that assumes a registered database has a file will crash if the file has been deleted. Check for file existence or catch the error when attempting to open a non-existent database.
