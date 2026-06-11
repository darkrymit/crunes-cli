# rune/permissions

Permission enforcement for all sandboxed rune capabilities. `permissions.js` merges plugin and project permission sets and exposes a `checkPermission` function; each capability (http fetch, env, store, ws client, ws server, http server) has its own pattern-matching module. Full docs: `docs/knowledge-base/modules/rune.md`

## Files

- **permissions.js** — `computeEffectivePermissions(pluginPerms, projectPerms, lifecycle)` — merges plugin and project permissions with syntactic normalization (no dir). `makePermissionChecker(effective, ctx?)` — builds per-capability pattern buckets; when `ctx = { dir, pluginId?, pluginDir?, projectId? }` is provided, `fs.*`, `cache.*`, and `sqlite.*` patterns are expanded at build time into all sibling forms (relative ↔ bare ↔ absolute ↔ `@project/` ↔ virtual token) so runtime path values match regardless of the form the rune author passes. `PermissionError` — thrown on denied access with `capability` and `value` properties.
- **permissions-http.js** — `matchFetchPermission(value, patterns)` — matches an HTTP fetch access value (`METHOD::URL`) against an array of allow/deny patterns with method and URL matching.
- **permissions-env.js** — `parseEnvPattern(pattern)` — parses an `env.read` pattern into `{ sources, keyPatterns }`. `matchEnvPermission(value, patterns)` — matches an env access value (`source::key`) against an array of patterns.
- **permissions-store.js** — `matchStorePermission(value, patterns)` — matches a cache or sqlite store access value (`location::name`) against an array of patterns.
- **permissions-http-server.js** — `matchHttpServerPermission(value, patterns)` — matches an HTTP server bind value against an array of patterns. `isLoopbackHost(host)` — returns true for loopback addresses (`127.0.0.1`, `localhost`, `::1`).
- **permissions-ws.js** — `matchWsPermission(url, patterns)` — matches a WebSocket client URL against an array of patterns. `matchWsServerPermission(value, patterns)` — matches a WebSocket server bind value (`host:port:path`) against an array of patterns.

## Related Modules

- `rune/api` — All API modules call `checkPermission` at construction time via `makePermissionChecker`.
- `rune/resolver` — `computeEffectivePermissions` is called before running any rune to merge project and plugin permission sets.
