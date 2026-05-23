# project

Reverse-lookup index from hashed project key to real project directory path. Full docs: `docs/knowledge-base/modules/project.md`

## Key Files

- **index.js** — `loadProjects()`, `upsertProject(key, projectDir)`.

## Related Modules

- `store` — `getProjectsJsonPath()` resolves the location of `projects.json`.
- `job` — `createJob` calls `upsertProject` to register the project on every job creation.
