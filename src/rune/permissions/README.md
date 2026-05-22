# rune/permissions

Permission model for sandboxed rune execution. Determines what each rune is allowed to do: filesystem reads, shell commands, HTTP requests, and env var access. Full docs: `docs/knowledge-base/modules/rune.md`

## Key Files

- **permissions.js** — `computeEffectivePermissions(base, project, lifecycle)` — merges base and project-level allow/deny lists; `makePermissionChecker(perms)` — returns per-operation check functions consumed by `rune/api` utils.
- **permissions-http.js** — `fetch:` permission pattern parsing and URL matching.
- **permissions-env.js** — `env:` permission pattern parsing (source + key glob matching via micromatch).
- **permissions-store.js** — `matchStorePermission(value, pattern, cap)` — permission matcher for `cache.*` and `sqlite.*` tokens. Handles virtual root patterns (`@project-cache/**`), bare virtual roots, and path+name two-segment patterns.

## Related Modules

- `rune/isolation` — Calls `computeEffectivePermissions` and `makePermissionChecker` before each isolate run.
- `rune/api` — `fs`, `shell`, `fetch`, and `env` utils delegate all permission checks here.
