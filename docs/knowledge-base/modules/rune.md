---
tags: [module]
---
# rune

> Key resolution, isolated-vm sandboxing, utils API, and permission enforcement — everything involved in executing a rune from key lookup to section output.

**Source:** `src/rune/`
**Submodules:** `api/`, `isolation/`, `permissions/`, `commands/`
**Related:** [[modules/core]], [[modules/plugin]], [[modules/shared]]

## Overview

Rune execution begins with a single entry point that resolves a key through a tiered lookup (local-only, plugin-specific, or bare), computes effective permissions, and delegates to the appropriate isolation runner. Every rune runs in its own fresh V8 isolate with no access to Node.js built-ins — all I/O flows through a `utils` bridge, a collection of granular async functions injected as host callbacks. The command-line parser accepts segments with the form `[--section s1,s2] [prefix:]key [rune-args...]`, but the section filter is applied post-execution by pattern matching against returned section names, not inside the isolate itself.

## Submodules

- **`isolation/`** — Manages the sandboxed VM lifecycle: creates the isolate, compiles built-in utility modules into it, injects the utils bridge as host callbacks, compiles the rune code, evaluates it, and collects results.
- **`api/`** — Implements the complete utils object that rune authors depend on, partitioned into namespace modules for filesystem I/O, process spawning, structured data handling, networking, configuration reading, output formatting, local storage, and cryptographic utilities.
- **`permissions/`** — Computes effective permission sets by merging plugin declarations, project overrides, and auto-grants, then provides per-operation checkers that gate all I/O calls.
- **`commands/`** — Implements CLI handlers: `run` executes runes and renders output, `list` enumerates available runes, `create` scaffolds new ones, `check` validates syntax and permissions, `benchmark` times execution over configurable repetitions.

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

**Effective permissions:** Permissions are computed by merging plugin declarations, project overrides, and auto-grants into a flat set of allow and deny patterns. Permissions must be nested under a lifecycle key (e.g. `{ "run": { "allow": [...] } }`); a flat top-level `allow` is silently ignored because it has no lifecycle context.

## Key Decisions

- **Auto-discover scans all enabled plugins:** When a bare key matches no project config entry, all enabled plugins are scanned for the key. If multiple plugins expose it, an error is thrown with the full list, forcing the user to disambiguate with `plugin:key`. This prevents silent shadowing.

- **Section filter applied post-execution:** The section filter is applied after the rune completes, not inside the isolate. This lets runes opt into internal filtering for performance while ensuring the full result is computed if they don't.

- **`$__hostRequire` deleted after evaluate:** Built-in modules call `$__hostRequire` during evaluation. Removing it before evaluation breaks builtins; removing it after evaluation closes a sandbox escape for rune code.

- **Project allow replaces plugin allow; project deny merges:** Project-level `allow` entirely replaces the plugin's permission list, giving projects control to restrict plugins. Plugin deny always unions with project deny, preserving the "most restrictive" invariant.

- **`@plugin/**` auto-grant:** Plugin runes always get `fs.read:@plugin/**` injected, resolving to the plugin cache directory. Plugin runes needing to read project files must explicitly declare `fs.read:./**`.

- **`rune.exec` spawns a child process:** Calling a rune via `rune.exec` does not run it in-process; it spawns a child process with its own isolate and permissions context.

## Virtual Location Tokens

Cache and sqlite operations use special tokens that resolve to different paths depending on context. Tokens like `@local-project-cache`, `@global-project-cache`, and plugin variants are available in different contexts (project vs. plugin runes). Consult `api/utils.js` for the complete token-to-path mapping.

## Rune Authoring

Every rune must export a `run` function called with the parsed argument object.

```js
import { md, section } from '@utils'

export async function run(args) {
  // args._         — data positionals (command tokens stripped)
  // args.$command  — space-separated matched command path (e.g. 'remote add')
  // args.$commands — array of matched command levels (e.g. ['remote', 'add'])
  // args.verbose   — named flag value (if args() export is defined)
  // fs.cwd()       — absolute path to the project root
}
```

**Typed arguments** — export an `args` function using the builder API:

```js
export async function args(b) {
  return b
    .option('-v, --verbose', 'Verbose output', false)
    .option('-c, --count <number>', 'Max results', 10)
    .positional('<target>', 'Target path')
    .command('sub', 'Sub-command', b => b.option('--flag', 'A flag'))
    .example('crunes run myrune foo', 'Basic use')
    .build()
}
```

The runner calls `args(builder)` before `run(parsedArgs)`. Without an `args` export, all positionals are collected as strings.

## Flows

- [[flows/run]] — owns the full execution path from CLI input to section output

## Gotchas & Debugging

- **Command-level flags must precede the key:** Running `crunes run --format json mykey` passes `--format json` as rune arguments, not a command flag. Place these flags before the key.

- **`section()` vs `section.create()`:** `section` is an object, not a function. Calling `section(name, data)` throws `TypeError: section is not a function`. Use `section.create(name, data)`.

- **`shell.exec` `opts.throw` defaults to `true`:** Non-zero exits throw by default. Pass `{ throw: false }` to get `{ stdout, stderr, exitCode, ok }` regardless of exit code.

- **`time.after` vs `time.afterRef`:** `time.after(ms)` uses an unref'd timer, so the process exits if nothing else is running. Use `time.afterRef(ms)` for top-level waits; use `after` inside loops.

- **`rune.exec` spawns a child process:** Calling `rune.exec` spawns `crunes run <key>` as a child with its own isolate and permissions, not a function call in the parent isolate.

- **Module compilation order matters:** Modules must be compiled and instantiated in the right order before evaluation, or "module not linked" errors occur.

- **`isolateTimeoutMs` is per-eval call, not total wall-clock:** A rune making many sequential operations can exceed real elapsed time. If a rune appears to hang, check for tight loops over large data.

- **`fs.glob` options control matching:** `onlyDirectories: true` returns only directories. `dot: true` enables hidden files. `expandDirectories: true` searches inside matched directories.

- **`json.readPath` returns only the first match:** Use `json.readPathAll` for expressions matching multiple nodes.

- **`json.modify` / `yaml.modify` / `xml.modify` callback semantics:** If the callback returns a value, that becomes the file content. Returning `undefined` writes the mutated data argument back.

- **`cache.open` and `sqlite.open` are async:** Forgetting `await` before `open()` causes all subsequent operations to run on a Promise, silently failing. Always `await` the open call.

- **`@local-project-plugin-cache` / `@local-project-plugin-sqlite` require a plugin context:** Calling these from a project rune throws an error. Use the project-scoped variants instead.

- **`env.read` silently fails for unpermitted keys:** If a key doesn't match any declared `env.read:` permission pattern, it returns `undefined` (or the fallback) without warning.

- **Lifecycle namespacing is mandatory in permissions:** Permissions declared in a flat `{ "allow": [...] }` structure (not nested under a lifecycle key) are silently ignored at runtime.

- **`normalizePattern` prepends `./`:** `fs.read:package.json` is normalized to `fs.read:./package.json`. Both bare and `./`-prefixed forms in config produce the same pattern, so they match interchangeably.

- **`http.fetch:` and `env.read:` use custom matchers, not micromatch:** These patterns are checked by custom logic before the standard micromatch pass, so they use different matching rules.

- **Shell/rune permission matching uses startsWith then micromatch:** `shell.run:**` and `shell.run:*` patterns use a `startsWith` check because micromatch can't match Windows drive letters (`C:/`) in glob tokens; all other patterns fall back to micromatch. `shell.run:git log *` allows `git log --oneline` but not `git status`.

- **Plugin runes execute with `dir` = project root, not plugin dir:** The `dir` parameter points to the project root. The plugin cache directory is used only for permission resolution.

- **`ws.server(httpServer)` registers at `open()` time:** The WebSocket registration happens when `open()` is called. Both orderings (before/after HTTP server opens) work because registration is buffered.

- **`ws.server` with `noServer: true` never auto-closes:** The `closed()` promise only resolves after explicit `close()`. Always call `close()` before awaiting `closed()`.

- **`ws.server` path patterns use `:paramName` syntax:** Patterns like `/logs/:jobId` extract captured segments. Specificity routing applies: literal segments beat named params.

- **`http.server` and `ws.server` permissions are checked at construction:** If a non-loopback host is missing required permissions, handle creation throws immediately, not at `open()` time.

- **`shell.spawn` and `rune.spawn` require an explicit `open()` call:** Both return a session object immediately without starting the subprocess. Register all handlers (`session.stdout.on`, `session.on('exit', ...)`, etc.) first, then call `session.open()` to start the process. Skipping `open()` means the process never starts and all reads hang indefinitely.

- **All `fs.*` operations support virtual-path prefixes:** Paths starting with `@` (e.g. `@local-project-cache/vault/file.enc`) are resolved through the virtual location scheme via `resolvePath`. `fs.glob` additionally reconstructs results with the original `@prefix/...` form so callers get back virtual paths, not real absolute ones.
