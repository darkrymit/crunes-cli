# job

Background job tracking: create, list, kill, and garbage-collect rune-spawned processes. Each job is persisted as a JSON file under `~/.crunes/jobs/`. Full docs: `docs/knowledge-base/modules/job.md`

## Files

- **index.js** — Re-exports all exports from `registry.js`.
- **registry.js** — `createJob(pid, opts)` — creates and stores a new job record. `getJob(key, id)` — retrieves a single job by key and id. `listJobs(key?)` — lists all jobs, optionally filtered by project key. `deleteJob(key, id)` — deletes a job record. `cleanJobs(key?)` — removes stale records for dead processes. `updateJobPid(key, id, pid)` — updates the PID of an existing job. `resolveJobId(id, jobs)` — resolves an ambiguous job ID via prefix matching. `isAlive(pid)` — checks if a process is still running. `jobStdoutPath(key, id)`, `jobStderrPath(key, id)` — return log file paths for a job.
- **commands/list.js** — `handler({ projectDir, global })` — lists and displays background jobs with live status (running/dead).
- **commands/kill.js** — `handler({ id, projectDir, global })` — terminates a background job with SIGTERM and removes its record.

## Related Modules

- `store` — `getStorePath()` resolves the base directory for job files.
- `project` — `upsertProject` is called by `createJob` to maintain the reverse-lookup index.
- `rune` — `isolation/runner.js` calls `createJob` when spawning background rune processes.
