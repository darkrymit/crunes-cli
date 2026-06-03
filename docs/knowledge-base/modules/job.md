---
tags: [module]
---
# job

> Background job tracking: create, list, kill, and garbage-collect rune-spawned processes.

**Source:** `src/job/`
**Related:** [[modules/store]], [[modules/project]], [[modules/rune]]

## Overview

When a rune spawns a long-running process, the job module records its existence. Each job becomes a small file in the store. There is no central index database — just one file per job. Listing jobs means scanning a directory. Cleaning up dead jobs is lazy — it happens the next time someone lists jobs, not immediately when the process dies.

This design avoids the concurrency issues that would arise from a shared index file. When multiple runes spawn jobs simultaneously, they each write their own file and there is no risk of corruption. The trade-off is that dead jobs linger until someone runs a list operation. In practice this is acceptable because job records are tiny and the cleanup is automatic and free.

## Concepts

**Project scope in filenames:** Job files are organized under a project identity, not a full path. This keeps directory names short and prevents the filesystem from exposing project locations in filenames. The identity is stable — it does not change when the project is renamed or moved — so job records naturally follow the project.

**Existence check without killing:** Determining whether a process is still alive uses a signal that checks existence but sends no data. This is safe to call repeatedly; it reads process information without side effects. On Windows this may not work for processes owned by other users, but it works reliably for processes in the current user session.

**Cleanup happens at read time:** When someone lists jobs, the system walks the job directory, checks which processes are still alive, and removes records for dead PIDs. This lazy cleanup means dead jobs accumulate between list operations, but they disappear the next time anyone lists. The alternative — synchronous cleanup when a job exits — would require daemons or background tasks.

**Job identification by prefix:** Job identifiers can be matched by prefix rather than requiring the full string. Since job IDs are long unique strings, eight characters is usually enough to identify one unambiguously. The system tries exact match first, then prefix match, and complains if zero or multiple jobs match the prefix.

**Log files are written directly by the job:** When a rune spawns a job, it passes open file descriptors for stdout and stderr directly to the spawned process. The process writes logs directly to files in the store. There is no redirection wrapper or buffering — the job owns the file handles. The only way to read logs is to load the entire file into memory.

## Key Decisions

**One file per job, no central index:** A single jobs.json file would require read-modify-write on every job spawn. With concurrent rune processes spawning jobs simultaneously, this creates a bottleneck and risk of corruption. Instead, each job writes its own file, eliminating coordination. The cost is that listing requires a directory scan instead of reading one file.

**Lazy garbage collection:** Dead job records are not cleaned up when the process exits — they are cleaned up the next time someone lists jobs. This is acceptable because job records are tiny, the cleanup is automatic and free, and it avoids complexity around signaling that a job has exited. A crashed process leaves a stale record that disappears on next list without any special handling.

**Jobs can exist outside project context:** A rune spawned outside any project directory produces a job with no project association. These show up in global job listings but do not belong to any project. This is intentional — runes can run in any context.

## Gotchas & Debugging

**Stale records after process crash:** If a rune process is killed with signal 9 (SIGKILL), it has no chance to clean up. Its job record persists. The record is not cleaned up until someone runs a list operation. If a developer tests repeatedly without listing, dead job files can accumulate. Running "list" triggers the cleanup.

**PID reuse causes false positives:** If a process dies and its process ID is reused by another completely different process, the existence check will return true for the stale job record even though the original job is long gone. There is no additional metadata to disambiguate — the system only stores the PID. On heavily loaded systems this is a real risk, though rare in practice.

**Log files grow without bound:** Job stdout and stderr files are never truncated or rotated. Long-running jobs can consume significant disk space if they produce lots of output. There is no mechanism to cap file size or archive old logs — the files exist until manually deleted or the entire job record is deleted.

**Jobs spawned from outside a project have null project reference:** This is valid and intentional. These jobs appear in global listing with a placeholder in the project column. Code that assumes all jobs belong to a project will crash if it does not check for this case.
