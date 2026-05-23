# job

Background job tracking: create, list, kill, and garbage-collect rune-spawned processes. Full docs: `docs/knowledge-base/modules/job.md`

## Key Files

- **registry.js** — `createJob`, `getJob`, `listJobs`, `deleteJob`, `cleanJobs`, `projectKey`, `isAlive`, `resolveJobId`.

## Sub-directories

- **commands/** — CLI handlers: `list`, `kill`.

## Related Modules

- `store` — `getStorePath()` resolves the base directory for job files.
- `project` — `upsertProject` is called by `createJob` to maintain the reverse-lookup index.
- `rune` — `isolation/runner.js` calls `createJob` when spawning background rune processes.
