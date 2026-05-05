# rune/isolation

Sandboxed VM lifecycle via `isolated-vm`. Manages isolate creation, script compilation, and teardown for both local runes and plugin runes. Full docs: `docs/knowledge-base/modules/rune.isolation.md` (pending)

## Key Files

- **runner.js** — `runRuneInIsolate(path, perms, args, dir, opts)` and `executePluginRune(opts)` — main entry points for sandboxed execution. Wires up the utils bridge and section callbacks.
- **resolver.js** — `createModuleResolver(...)` — ESM module resolution inside the isolate context; handles relative imports from rune files.
- **utils-bootstrap.js** — Source string embedded at build time; in-isolate stub that proxies all `utils.*` calls back to the host over the `isolated-vm` reference channel.
- **console-bootstrap.js** — Source string embedded at build time; console shim that forwards `console.log` / `error` from inside the isolate to the host process.
- **builtins.js** — Built-in polyfills injected into every isolate (e.g. `structuredClone`, `URL`).

## Related Modules

- `rune/api` — Provides `createUtils`; its methods are proxied through the bootstrap stubs.
- `rune/permissions` — `computeEffectivePermissions` and `makePermissionChecker` are called before each isolate run.
