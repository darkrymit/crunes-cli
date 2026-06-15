# project

Project identity and reverse-lookup index: maps a hashed project key to its real directory path, and maintains a global `projects.json` registry. Full docs: `docs/knowledge-base/modules/project.md`

## Files

- **index.js** — `ensureProjectIdentity(dir)` — loads or creates project identity (`id` + `alias`) in `.crunes/project.local.json`. `getProjectKey(dir, name?)` — returns a unique project key (name-hash, id, or hash fallback). `loadProjects()` — loads all projects from the global `projects.json` store. `upsertProject(id, projectDir)` — creates or updates a project entry with timestamp metadata. `shortHash(str)` — generates an 8-character SHA1 hash prefix.

## Related Modules

- `store` — `getProjectsJsonPath()` resolves the location of `projects.json`.
- `rune` — `isolation/runner.js` calls `ensureProjectIdentity` + `upsertProject` as a fire-and-forget observability call at rune start.
