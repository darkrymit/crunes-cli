---
type: module
title: project
description: A stable per-project identity that survives renames and moves, plus a global reverse index from identity to directory so cross-project operations need no filesystem scan.
tags: [module, project, identity]
resource: src/project/
---

# project

Each project gets an identity that does not change when the project is renamed or moved. Cache buckets, sqlite databases and job records are keyed by it, which is what lets all of them survive a reorganisation intact.

## Two parts, one of which is stable

**The id** is generated once and never changes. **The alias** is human-readable and may be updated.

The id is written to `.crunes/project.local.json`, gitignored by convention, and mirrored into `<store>/projects.json` — a reverse index mapping identity to current path and last-active time.

The index exists so that global operations, such as listing every job on the machine, can find project directories by reading one file instead of scanning the filesystem.

## Decisions folded here

**The id is generated, not derived from the path.** Computing identity from the directory name would mean every rename invalidated every cache bucket and database keyed by it. Generating once and persisting is what makes the data survive.

A consequence worth stating: the id includes a random component, so the same repository cloned on two machines produces two identities. That is intended — the identity is of a checkout, not of a repository.

**Establishment is idempotent.** Reading-or-creating the identity file and refreshing the registry entry can run on every invocation without harm. If the identity exists, only the path and timestamp update. That idempotence is what makes it safe to call unconditionally.

**The registry is separate from job records.** Deriving the project list by scanning every job file would make global listing proportional to job count; one file makes it constant, and it is also where last-active time and the friendly name live.

## Gotchas

**The identity file must stay gitignored.** Committed, it gives two developers the same id — their cache buckets and databases then alias each other, and writes from one machine appear on the other. The corruption is quiet and very hard to trace back to its cause.

**A missing identity file is regenerated, not an error.** Deleting it does not break anything; a new id is created. That resilience also means a deleted file silently orphans whatever the old id keyed.

**A move updates the path, never the id.** The next invocation re-establishes identity and refreshes the registry path. Anything keyed by id keeps working; anything that stored the old path does not.
