---
type: module
title: sqlite
description: Named SQLite databases registered in a central index, sharing the cache module's scope and key-hashing rules, with WAL sidecars that deletion must account for.
tags: [module, sqlite, storage]
resource: src/sqlite/
---

# sqlite

Structured storage for runes that need more than key/value. A rune opens a database by name and gets a SQL interface; `<store>/sqlite.json` records each one.

Scopes and key hashing are the same three as [cache](/modules/cache.md) — `local`, `local-plugin`, `global-plugin` — and for the same reason: two projects may both want a database called `metadata`.

## WAL sidecars

In WAL mode SQLite keeps two auxiliary files beside the database. They are transient: present while the database is active, or left behind when a process died before checkpointing.

**Deleting a database must remove all three files.** A deletion that removes only the main file leaves sidecars that mean nothing on their own. Missing sidecars are not an error — a database never opened in WAL mode has none — so the delete succeeds either way.

## The management query is read-only

`crunes sqlite query` opens read-only and rejects writes. This is a usability guard, not a security boundary: it prevents the common accident of mutating data from a command meant to inspect it. Intentional writes go through the rune API, where permissions apply.

It uses synchronous access deliberately — the command runs one query and exits, so an async API would add machinery for concurrency that never happens.

## Gotchas

**The registry is independent of the files.** A registered database whose file was deleted still lists. Code assuming a registered database has a file will throw on open; check existence or handle the error.

**A crash leaves a `-wal` file, and that is fine.** It holds uncommitted writes, is not corruption, and the next reader reads through it. A checkpoint or a delete clears it.

**Writers to one database serialise.** SQLite enforces this at the database level, so a rune writing in a long transaction blocks every other rune writing to the same database. Not a bug — the guarantee being paid for.
