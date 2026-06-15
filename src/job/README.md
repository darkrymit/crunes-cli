# job

Background job tracking: create, list, kill, and garbage-collect rune-spawned processes. Each job is persisted under `<projectDir>/.crunes/jobs/<id>/` as `job.json` plus `stdout.log`, `stderr.log`, `stdin.log`. Full docs: `docs/knowledge-base/modules/job.md`

## Files

- **index.js** — Re-exports all exports from `registry.js`.
- **registry.js** — `createJob(pid, opts)` — creates a job dir and `job.json` record, returns `{ id }`. `getJob(projectDir, id)` — retrieves a single job by project dir and id. `listJobs(projectDir)` — lists all jobs for a project. `deleteJob(projectDir, id)` — removes the job directory. `cleanJobs(projectDir)` — removes directories for dead processes. `updateJobPid(projectDir, id, pid)` — updates the PID of an existing job. `resolveJobId(id, jobs)` — resolves an ambiguous job ID via prefix matching. `isAlive(pid)` — checks if a process is still running. `jobStdoutPath(projectDir, id)`, `jobStderrPath(projectDir, id)`, `jobStdinPath(projectDir, id)` — return log file paths for a job.
- **commands/list.js** — `handler({ projectDir })` — lists and displays background jobs with live status (running/dead).
- **commands/kill.js** — `handler({ id, projectDir })` — terminates a background job with SIGTERM and removes its record.

## Related Modules

- `rune` — `isolation/runner.js` calls `createJob` when spawning background rune processes.
