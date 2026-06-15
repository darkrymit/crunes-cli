---
tags: [module]
---
# rune

> Key resolution, isolated-vm sandboxing, utils API, and permission enforcement — everything involved in executing a rune from key lookup to section output.

**Source:** `src/rune/`
**Submodules:** `api/`, `isolation/`, `permissions/`, `commands/`
**Related:** [[modules/core]], [[modules/plugin]], [[modules/shared]]

## Overview

Rune execution begins with a single entry point that resolves a key through a tiered lookup (local-only, plugin-specific, or bare), computes effective permissions, and delegates to the appropriate isolation runner. Every rune runs in its own fresh V8 isolate with no access to Node.js built-ins — all I/O flows through a `utils` bridge, a collection of granular async functions injected as host callbacks. The command-line parser accepts segments with the form `[prefix:]key[-s s1,s2] [rune-args...]`, but the section filter is applied post-execution by pattern matching against returned section names, not inside the isolate itself.

## Submodules

- **`isolation/`** — Manages the sandboxed VM lifecycle: creates the isolate, compiles built-in utility modules into it, injects the utils bridge as host callbacks, compiles the rune code, evaluates it, and collects results.
- **`api/`** — Implements the complete utils object that rune authors depend on, partitioned into namespace modules for filesystem I/O, process spawning, structured data handling, networking, configuration reading, output formatting, local storage, and cryptographic utilities.
- **`permissions/`** — Computes effective permission sets by merging plugin declarations, project overrides, and auto-grants, then provides per-operation checkers that gate all I/O calls.
- **`commands/`** — Implements CLI handlers: `run` executes runes and renders output, `repl` runs a rune in persistent REPL mode, `list` enumerates available runes, `create` scaffolds new ones, `benchmark` times execution over configurable repetitions.

## Concepts

**Key resolution tiers** (in order, first match wins):
1. `local:` prefix → skip plugin lookup entirely, check project config only.
2. `plugin:name` prefix → resolve directly by plugin name from the global registry.
3. Bare key → check project config first, then auto-discover from all enabled plugins.

**Plugin alias entries:** A config entry with a `plugin` field instead of a `path` field acts as an alias that re-dispatches to the specified plugin rune, with optional permission and variable overrides at the alias level.

**Result normalisation:** Runes return results in different shapes, but the runner normalizes them to an array: `null` becomes `[]`, a single object becomes `[obj]`, arrays pass through.

**Circular call detection:** The call stack is tracked across the execution chain. If a key appears twice in the chain, a circular error is thrown showing the full cycle. Child rune calls spawn separate processes and do not share the parent's call stack.

**Reference bridge architecture:** The utils methods call back into the host via References (the only mechanism that can carry async operations across the isolate boundary). Adding a new utils capability requires three changes: (1) implement in the host-side api module, (2) inject as a Reference in the runner, (3) expose in the isolate-side bootstrap. Missing any step silently fails.

**Static modules compiled from source strings:** Built-in utility modules are stored as source strings and compiled into the isolate at runtime, keeping them sandboxed while remaining real ESM modules with imports between them.

**Effective permissions:** Permissions are computed by merging plugin declarations, project overrides, and auto-grants into a flat set of allow and deny patterns. For `fs.*`, `cache.*`, and `sqlite.*` capabilities, each pattern is expanded into all equivalent sibling forms (relative ↔ bare ↔ absolute ↔ `@project/` ↔ virtual-token) at checker build time so runtime path values match regardless of the form the rune author passes — raw values go straight to `checkPermission` without normalization. Permissions must be nested under a lifecycle key (e.g. `{ "run": { "allow": [...] } }`); a flat top-level `allow` is silently ignored because it has no lifecycle context.

## Key Decisions

- **Auto-discover scans all enabled plugins:** When a bare key matches no project config entry, all enabled plugins are scanned for the key. If multiple plugins expose it, an error is thrown with the full list, forcing the user to disambiguate with `plugin:key`. This prevents silent shadowing.

- **Section filter applied post-execution:** The section filter is applied after the rune completes, not inside the isolate. This lets runes opt into internal filtering for performance while ensuring the full result is computed if they don't.

- **`$__hostRequire` deleted after evaluate:** Built-in modules call `$__hostRequire` during evaluation. Removing it before evaluation breaks builtins; removing it after evaluation closes a sandbox escape for rune code.

- **Project allow replaces plugin allow; project deny merges:** Project-level `allow` entirely replaces the plugin's permission list, giving projects control to restrict plugins. Plugin deny always unions with project deny, preserving the "most restrictive" invariant.

- **`@plugin/**` auto-grant:** Plugin runes always get `fs.read:@plugin/**` injected, resolving to the plugin cache directory. Plugin runes needing to read project files must explicitly declare `fs.read:./**`.

- **`rune.exec` / `rune.spawn` / `rune.job.start` spawn child processes:** These never run in-process — they always spawn a child with its own isolate and permissions context. Without `repl: true` they spawn `crunes run <key>`; with `repl: true` they spawn `crunes repl <key>` and require `rune.repl:<key>` permission instead of `rune.run:<key>`.

## Virtual Location Tokens

Cache and sqlite operations use special tokens that resolve to different paths depending on context. Tokens like `@local-project-cache`, `@global-project-cache`, and plugin variants are available in different contexts (project vs. plugin runes). Consult `api/utils.js` for the complete token-to-path mapping.

## Rune Authoring

### run mode

Every rune must export a `run` function called with the parsed argument object.

```js
import { md, section } from '@utils'

export async function run(args) {
  // args._         — data positionals (command tokens stripped)
  // args.$command  — space-separated matched command path (e.g. 'remote add')
  // args.$commands — array of matched command levels (e.g. ['remote', 'add'])
  // args.verbose   — named flag value (if args() export is defined)
}
```

**Typed arguments** — export an `args` function using the builder API:

```js
export async function args(b) {
  return b
    .option('-v, --verbose', 'Verbose output', false)
    .option('-c, --count <number>', 'Max results', 10)
    .positional('<target>', 'Target path')
    .command('sub', 'Sub-command', sub => sub.option('--flag', 'A flag'))
    .example('crunes run myrune foo', 'Basic use')
    .build()
}
```

The runner calls `args(builder)` before `run(parsedArgs)`. Without an `args` export, all positionals are collected as strings.

**Help text** — `import { help } from '@utils'` inside `run` to access the formatted CLI help string for the current rune: `help.text()` returns a plain string, `help.section()` wraps it in a markdown section ready to return.

### repl mode

Export `repl` (session initializer) and/or `inputRepl` (per-input handler) to enter interactive mode via `crunes repl <key>`. The isolate stays alive across inputs — JS module-level variables are session state.

```js
import { section, md } from '@utils'

export async function argsRepl(b) { return b.option('--db <path>', 'Database', './state').build() }
export async function repl(args) { /* open connections, return initial prompt string */ }
export function bannerRepl(args) { /* return welcome string shown before first prompt */ }
export function commandsRepl(b) { return b.command('exit', 'Quit') }
export async function inputRepl(input) {
  if (input.type === 'eof') return { type: 'done' }
  if (input.type === 'command' && input.args.$command === 'exit') return { type: 'done' }
  // input.type === 'line' — input.text is the raw line
  // return { type: 'prompt', value: 'new> ' } to change prompt
  // return void / undefined to keep current prompt
}
export async function completeInputRepl(tokens) { /* return completion candidates */ }
export async function disposeRepl() { /* cleanup on session end */ }
```

`repl` requires a separate `"repl"` permission block — it does not inherit from `"run"`.

## Flows

- [[flows/run]] — owns the full execution path from CLI input to section output

## Gotchas & Debugging

- **Command-level flags must precede the key:** Running `crunes run --format jsonl mykey` passes `--format jsonl` as rune arguments, not a command flag. Place these flags before the key.

- **Section filters use bracket syntax — `-s` before the key is rejected:** The only supported way to filter sections is `key[-s section]`. Running `crunes run -s endpoints api` causes a "misplaced flag" error because the first positional is parsed as the rune key and anything starting with `-` is rejected. Correct: `crunes run api[-s endpoints]`.

- **`help` must be imported — it is not a global:** `import { help } from '@utils'` is required. `help.text()` returns the formatted CLI help string for the current rune; `help.section()` wraps it as a markdown section. Returns an empty string if the rune has no `args`/`argsRepl` schema.

- **`section()` vs `section.create()`:** `section` is an object, not a function. Calling `section(name, data)` throws `TypeError: section is not a function`. Use `section.create(name, data)`.

- **`shell.exec` `opts.throw` defaults to `true`:** Non-zero exits throw by default. Pass `{ throw: false }` to get `{ stdout, stderr, exitCode, ok }` regardless of exit code.

- **`time.after` keeps the process alive:** `time.after(ms)` uses a ref'd timer — the process will not exit while it is pending. Global `setTimeout` inside the sandbox uses an unref'd timer, so the process can exit if nothing else holds a ref.

- **`rune.exec` spawns a child process:** Calling `rune.exec` spawns `crunes run <key>` (or `crunes repl <key>` with `{ repl: true }`) as a child with its own isolate and permissions, not a function call in the parent isolate.

- **`rune.repl:<key>` is a separate permission from `rune.run:<key>`:** Calling `rune.exec`, `rune.spawn`, or `rune.job.start` with `{ repl: true }` checks `rune.repl:<key>`, not `rune.run:<key>`. Declare it under the `repl` lifecycle block: `"repl": { "allow": ["rune.repl:worker"] }`.

- **`rune.job.write` / `shell.job.write` throw if the job has no stdin.log:** These methods append to the job's `stdin.log` file, which only exists when the job was started with `{ repl: true }`. Calling them on a non-repl job throws `ENOENT`. Check that the job was started in repl mode before writing.

- **Module compilation order matters:** Modules must be compiled and instantiated in the right order before evaluation, or "module not linked" errors occur.

- **`isolateTimeoutMs` is per-eval call, not total wall-clock:** A rune making many sequential operations can exceed real elapsed time. If a rune appears to hang, check for tight loops over large data.

- **`fs.glob` options control matching:** `onlyDirectories: true` returns only directories. `dot: true` enables hidden files. `expandDirectories: true` searches inside matched directories.

- **`json.readPath` returns only the first match:** Use `json.readPathAll` for expressions matching multiple nodes.

- **`json.modify` / `yaml.modify` / `xml.modify` callback semantics:** If the callback returns a value, that becomes the file content. Returning `undefined` writes the mutated data argument back.

- **`cache.open` and `sqlite.open` are async:** Forgetting `await` before `open()` causes all subsequent operations to run on a Promise, silently failing. Always `await` the open call.

- **`@local-project-plugin-cache` / `@local-project-plugin-sqlite` require a plugin context:** Calling these from a project rune throws an error. Use the project-scoped variants instead.

- **`env.read` silently fails for unpermitted keys:** If a key doesn't match any declared `env.read:` permission pattern, it returns `undefined` (or the fallback) without warning.

- **Lifecycle namespacing is mandatory in permissions:** Permissions declared in a flat `{ "allow": [...] }` structure (not nested under a lifecycle key) are silently ignored at runtime.

- **`normalizePattern` prepends `./` to bare fs names:** `fs.read:package.json` is normalized to `fs.read:./package.json`. Both bare and `./`-prefixed forms in config produce the same pattern.

- **`fs.*`, `cache.*`, and `sqlite.*` patterns are expanded into all sibling forms at checker build time:** When `makePermissionChecker` receives a `ctx` (`{ dir, pluginId?, pluginDir?, projectId? }`), every pattern value is expanded into all equivalent forms so runtime path values match regardless of how the rune author wrote them. A relative pattern like `fs.read:./src/**` also produces `src/**`, `<dir>/src/**`, and `@project/src/**`; an absolute path inside the project root emits relative siblings; a `@local-project-*` token resolves to its absolute path and also emits `./rel`, `rel`, and `@project/rel` siblings; `@global-*` and `@plugin` tokens emit only the resolved absolute sibling. `~/...` emits a HOME-expanded absolute sibling only. `../...` and absolute paths outside the project get no sibling. **Exception:** `./` patterns whose bare suffix would be `**` or `**/...` (i.e. `./**` or `./**/x`) do not emit the bare suffix — this preserves the semantic distinction between `./**` (repo-scoped) and `**` (unrestricted, matches absolute paths). Expansion happens in `makePermissionChecker`, not in `computeEffectivePermissions`. The same expansion covers `cache.*` and `sqlite.*` store patterns — `cache.read:@local-project-cache/vault::name` expands to all sibling location forms with `::name` reattached.

- **`http.fetch:` and `env.read:` parse values before matching:** These capabilities split the value into structured parts (method, URL, source, key) before matching. Each sub-matcher (`matchFetchPermission`, `matchEnvPermission`, etc.) accepts a full patterns array and loops internally — `checkPermission` passes the whole bucket array in one call rather than iterating with `.some` at the call site.

- **Shell/rune/db/env-key/store-name matching uses `isWildcardMatch`, not micromatch:** These capabilities use a regex-based flat matcher where `*` matches any characters including `/`, spaces, and commas. This is intentional — shell commands like `bash ./run.sh --profile=dev,staging` contain `/` and commas that would silently block a `bash *` micromatch pattern. `fs.*`, `http.*`, and `ws.*` still use `isGlobMatch` (micromatch) where `*` stops at `/` because path-segment boundaries are a meaningful security boundary for files and URLs.

- **Plugin runes execute in the project root context:** The project root is used as the working directory for plugin rune execution. The plugin cache directory is used only for resolving the rune file path and node_modules.

- **`ws.server(httpServer)` registers at `open()` time:** The WebSocket registration happens when `open()` is called. Both orderings (before/after HTTP server opens) work because registration is buffered.

- **`ws.server` with `noServer: true` never auto-closes:** The `closed()` promise only resolves after explicit `close()`. Always call `close()` before awaiting `closed()`.

- **`ws.server` path patterns use `:paramName` syntax:** Patterns like `/logs/:jobId` extract captured segments. Specificity routing applies: literal segments beat named params.

- **`http.server` and `ws.server` permissions are checked at construction:** If a non-loopback host is missing required permissions, handle creation throws immediately, not at `open()` time.

- **`shell.spawn` and `rune.spawn` require an explicit `open()` call:** Both return a session object immediately without starting the subprocess. Register all handlers (`session.stdout.on`, `session.on('exit', ...)`, etc.) first, then call `session.open()` to start the process. Skipping `open()` means the process never starts and all reads hang indefinitely.

- **All `fs.*` operations support virtual-path prefixes:** Paths starting with `@` (e.g. `@local-project-cache/vault/file.enc`) are resolved through the virtual location scheme via `resolvePath`. `fs.glob` additionally reconstructs results with the original `@prefix/...` form so callers get back virtual paths, not real absolute ones.

- **`logger` is a global — no import needed:** The `logger` object is injected into every rune sandbox alongside `console`. Use `logger.info(message, meta?)`, `logger.warn(...)`, `logger.error(...)`, `logger.debug(...)` to emit structured log events. Each call emits `{ type: 'log', level, message, meta? }` through the event pipeline; in text mode these write to stderr, in JSONL mode they appear as JSON objects on stdout. The optional `meta` param is a plain object surfaced in JSONL output and in the `[level]` prefix in text output. `console.log/warn/error` also emit `{ type: 'log', level: 'log'/'warn'/'error' }` — the same unified event shape, just without the `meta` field.

- **`dispose()` and `disposeRepl()` are optional lifecycle exports:** Export `dispose()` from a rune to run cleanup after `run()` resolves or throws (close connections, release handles). Export `disposeRepl()` to run cleanup when a REPL session ends — it is called on normal exit, Ctrl+D, and signal teardown, even if `inputRepl()` never received an `eof` event. Errors thrown in either function are swallowed. Neither receives arguments.

- **`batch.allow` / `batch.deny` must be declared for `-b` runs:** When a rune is invoked via `crunes run -b`, the runner checks the rune's config entry for a `batch` block before executing. Without it, the run is blocked. Add a `batch` block to the rune's `.crunes/config.json` entry: `"batch": { "allow": ["*"], "deny": [] }`. Patterns match against the rune args string (everything after the key); `*` matches any args. The `deny` list is checked first.

```json
{
  "runes": {
    "my-rune": {
      "path": ".crunes/runes/my-rune.js",
      "batch": { "allow": ["*"] }
    }
  }
}
```
