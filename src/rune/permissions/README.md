# rune/permissions

Permission enforcement for all sandboxed rune capabilities. `permissions.js` merges plugin and project permission sets and exposes a `checkPermission` function; each capability (http fetch, env, store, ws client, ws server, http server) has its own pattern-matching module. Full docs: `docs/knowledge-base/modules/rune.md`

## Files

- **permissions.js** — `computeEffectivePermissions(pluginPerms, projectPerms, lifecycle)` — merges plugin and project permissions with syntactic normalization (no dir). `makePermissionChecker(effective, ctx?)` — builds per-capability pattern buckets; when `ctx = { dir, pluginId?, pluginDir?, projectId? }` is provided, fs patterns are expanded at build time into sibling absolute/relative/virtual forms so runtime path values match regardless of their form. `PermissionError` — thrown on denied access with `capability` and `value` properties.
- **permissions-http.js** — `matchFetchPermission(value, pattern)` — matches an HTTP fetch access value (`METHOD::URL`) against an allow/deny pattern with method and URL matching.
- **permissions-env.js** — `parseEnvPattern(pattern)` — parses an `env.read` pattern into `{ sources, keyPatterns }`. `matchEnvPermission(value, pattern)` — matches an env access value (`source::key`) against a pattern.
- **permissions-store.js** — `matchStorePermission(value, pattern)` — matches a cache or sqlite store access value (`location::name`) against a pattern.
- **permissions-http-server.js** — `matchHttpServerPermission(value, pattern)` — matches an HTTP server bind value against a pattern. `isLoopbackHost(host)` — returns true for loopback addresses (`127.0.0.1`, `localhost`, `::1`).
- **permissions-ws.js** — `matchWsPermission(url, pattern)` — matches a WebSocket client URL against a pattern. `matchWsServerPermission(value, pattern)` — matches a WebSocket server bind value (`host:port:path`) against a pattern.

## Related Modules

- `rune/api` — All API modules call `checkPermission` at construction time via `makePermissionChecker`.
- `rune/resolver` — `computeEffectivePermissions` is called before running any rune to merge project and plugin permission sets.
