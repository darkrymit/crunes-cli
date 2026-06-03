---
tags: [module]
---
# project

> Project identity management: establishes a stable per-project ID, tracks alias, and maintains a global reverse-lookup index from ID to directory path.

**Source:** `src/project/`
**Related:** [[modules/store]], [[modules/job]], [[modules/cache]], [[modules/sqlite]]

## Overview

Each project gets a stable identity that persists even when the project moves or is renamed. This identity is stored in a local file (gitignored, so each developer has their own) and is also tracked in a global registry that maps identities to directory paths. The registry exists so that cross-project operations — like listing all jobs globally — can find project directories without scanning the filesystem.

The identity itself has two components: a unique ID (stable, never changes) and an alias (human-readable, can update). The ID is the critical piece; it is generated once and persists. The alias can change as the project is renamed, but the ID stays constant. This means cache data and database records keyed by ID survive moves and renames intact.

## Concepts

**Project identity file:** Each project keeps a small file in its local config directory containing the stable ID and current alias. This file is gitignored by convention — each developer's checkout generates its own ID. The ID is derived from the project directory name plus a random suffix, so the same project cloned on two different machines produces two different IDs. The identity is established once and never changes, even if the project is renamed or moved.

**Global registry maps identity to location:** A file in the user's home directory tracks all known project identities and where they live on disk. This registry is updated every time a project is activated. It serves two purposes: it provides a directory lookup by identity (useful for job listing) and it tracks metadata like when each project was last active.

**Identity establishment is idempotent:** The process of establishing a project's identity can be called repeatedly without harm. It reads or creates the identity file, then updates the global registry with the current path and timestamp. If the identity already exists, the path is updated (useful after a move) but the ID stays the same. This idempotence is why the operation can be called on every rune invocation without concern.

## Key Decisions

**ID is not derived from path:** The identity is generated once and persisted, not recomputed from the current directory name. This means renaming or moving a project does not change its ID. Cache buckets and database records that reference the ID continue to work after the move. The alternative — computing identity from current path — would break all cached data whenever a project was reorganized.

**Separate registry from job records:** Rather than computing the list of known projects by scanning all job files, a centralized registry maintains the mapping. This makes operations like "list all jobs globally" fast — read one file instead of scanning many. The registry is also the source of truth for when a project was last active and what its friendly name is.

## Gotchas & Debugging

**Identity file must be gitignored:** If the identity file is committed to version control, two developers working on the same project will share the same ID. Their cache buckets and databases will alias each other — writes from one developer's machine affect the other's data. Cache pollution is often subtle and hard to debug. Always ensure this file is in the gitignore.

**Missing identity file is auto-generated:** The operation that establishes identity does not fail if the file is absent — it creates one. This makes the system resilient to accidents (deleting the identity file does not break anything) and makes testing simple (no manual setup needed). A new identity is generated if the file is missing.

**Path updates on move, ID stays stable:** After a project is moved to a new directory, the next time a rune runs, the identity is re-established and the global registry is updated with the new path. But the ID in the identity file never changes. This is the mechanism that makes cached data and databases survive moves — everything is keyed by ID, not by path.
