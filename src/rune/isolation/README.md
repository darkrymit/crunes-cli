# rune/isolation

Sandboxed VM lifecycle via `isolated-vm`. Manages isolate creation, script compilation, module resolution, and teardown for both local runes and plugin runes. Full docs: `docs/knowledge-base/modules/rune.md`

## Files

- **runner.js** — `runRuneInIsolate(runeFile, effective, args, projectDir, opts)` — core isolation runner: executes a rune file inside a V8 isolate with permissions and streaming I/O. `executePluginRune(params)` — computes effective permissions and runs a plugin rune. `runPluginRune(pluginDir, pluginCacheDir, runeKey, pluginJson, effective, args, projectDir, opts)` — convenience wrapper for plugin runes. `getArgsSchema(runeFile, effective, projectDir, opts)` — boots a rune in a minimal isolate and returns its `args()` export schema as JSON. `getPluginRunePath(pluginDir, runeKey, pluginJson)` — resolves the file path for a plugin rune.
- **resolver.js** — `createModuleResolver(isolate, pluginDir, pluginNodeModules, pluginDeps, effectiveAllow, effectiveDeny, projectDir, pluginRootDir, virtualModules)` — creates an ESM module resolver for `isolated-vm` contexts with permission checking and virtual module support.
- **utils-bootstrap.js** — In-isolate stub that proxies all `utils.*` and section calls back to the host over the `isolated-vm` reference channel. Embedded at build time as a source string; runs entirely inside the isolate.
- **console-bootstrap.js** — In-isolate console shim that forwards `console.log` / `error` from inside the isolate to the host process. Embedded at build time as a source string.
- **builtins.js** — `DENY_BUILTINS` — map of blocked Node.js modules with actionable error messages shown when a rune attempts to `import` them.
- **embedded.js** — Dev/test stub that exports empty strings for `md`, `tree`, `utils`, and `console` source strings. At build time the esbuild plugin replaces this with the real embedded sources; this file is never present in `dist/cli.js`.

## Related Modules

- `rune/api` — Provides `createUtils`; its methods are proxied through `utils-bootstrap.js`.
- `rune/permissions` — `computeEffectivePermissions` and `makePermissionChecker` are called before each isolate run.
- `job` — `createJob` and registry helpers are called when spawning background rune processes.
- `project` — `ensureProjectIdentity` + `upsertProject` are called fire-and-forget at rune start for observability.
