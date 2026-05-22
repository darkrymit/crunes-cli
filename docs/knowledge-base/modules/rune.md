---
tags: [module]
---
# rune

> Key resolution, isolated-vm sandboxing, utils API, and permission enforcement — everything involved in executing a rune from key lookup to section output.

**Source:** `src/rune/`
**Submodules:** `api/`, `isolation/`, `permissions/`, `commands/`
**Related:** [[modules/core]], [[modules/plugin]], [[modules/shared]]

## Overview

`runRune(dir, config, key, args, opts, _callStack)` in `resolver.js` is the single entry point for all rune execution. It resolves a key through three tiers, computes effective permissions, and delegates to `runRuneInIsolate` (local runes) or `executePluginRune` (plugin runes) in `isolation/runner.js`.

Every rune runs in a fresh V8 isolate. The isolate cannot access Node builtins directly — all I/O goes through the `utils` bridge: host-side async functions injected as `$__utils_fs_read`, `$__utils_shell`, etc. The `createUtils` function in `api/index.js` assembles the full `utils` object from its constituent modules. Each I/O namespace calls `permChecker` before any operation.

The key token format parsed by `parseKeyToken` in `commands/use.js` is `[prefix:]name[=arg1,arg2][::section1,section2]`. The `::sections` filter is NOT applied inside the isolate — it is applied in `use.js` by micromatch after `runRune` returns.

## Submodules

- **`isolation/`** — Sandboxed VM lifecycle: create isolate → compile static modules → inject `$__` bridges → compile rune ESM → evaluate → collect sections.
- **`api/`** — The `utils` object rune authors interact with: `fs`, `shell`, `json`, `fetch`, `env`, `vars`, `md`, `tree`, `section`.
- **`permissions/`** — `computeEffectivePermissions` and per-operation checkers (`fs`, `http`, `env`, `shell`).
- **`commands/`** — CLI handlers: `use`, `list`, `create`, `check`, `bench`.

## Concepts

**Key resolution tiers** (in order, first match wins):
1. `local:` prefix → skip plugin lookup entirely, check project config only.
2. `plugin:name` prefix → resolve directly by plugin name from the global registry (`resolvePluginRune`).
3. Bare key → check project config first (`config.runes[key]`), then auto-discover from all enabled plugins (`resolveRuneFromPlugins`).

**Plugin alias entries:** A config entry with a `plugin` field instead of a `path` field is an alias (`{ plugin: "pluginBareName:runeKey" }`). `runRune` re-dispatches through `resolvePluginRune`, applying the alias entry's own `permissions` and `vars` if present (overriding the plugin's declared values).

**Result normalisation:** `normaliseResult` ensures `runRune` always returns an array. `null` → `[]`, a single object → `[obj]`, an array → pass-through.

**Circular call detection:** `_callStack` is an array of keys in the current call chain. If `_callStack.includes(key)`, `CircularRuneError` is thrown with the full chain. Child rune calls (via `utils.rune`) pass `nextStack` recursively but reset `sections` to `null`.

**Reference bridge:** `utils` methods are async — they call back into the host via `isolated-vm` References (`$__utils_fs_read`, `$__utils_shell`, etc.). `ExternalCopy` cannot carry promises or callbacks, so References are the only option. Adding a new `utils` capability requires three changes: (1) implement in `src/rune/api/<module>.js`, (2) inject as a `$__utils_<name>` Reference in `injectUtils()` in `runner.js`, (3) expose it in `utils-bootstrap.js` inside the isolate. Missing any side silently fails.

**Static modules compiled from source strings:** `md.js`, `tree.js`, `utils-bootstrap.js`, and `console-bootstrap.js` are embedded as source strings at esbuild time and compiled into the isolate via `compileModule`. This keeps them fully sandboxed — they cannot reach the host filesystem — while still being real ESM modules with imports between them.

**Effective permissions:** `computeEffectivePermissions` merges plugin-declared permissions → project overrides → auto-grants (`@plugin/**` for plugin runes). Result is a flat `{ allow, deny }` pair of micromatch patterns used by `makePermissionChecker` to gate every I/O call. Permissions must be declared under a lifecycle key: `{ "use": { "allow": [...] } }`. A flat `{ "allow": [...] }` produces an empty set silently.

## Key Decisions

- **Auto-discover scans all enabled plugins:** When a bare key matches no project config entry, `resolveRuneFromPlugins` loads the global registry and reads `plugin.json` for every enabled plugin to find matches. If multiple plugins expose the same key, it throws immediately listing all ambiguous plugin names and instructing the user to use `plugin:key`. This prevents silent shadowing.

- **Section filter applied post-execution:** The `opts.sections` value is forwarded to `runRuneInIsolate` for `utils.section.match()` to use internally (early-exit optimisation, opt-in), but the actual glob filter happens in `commands/use.js` after `runRune` returns. The rune always executes in full unless it explicitly checks `utils.section.match()`.

- **`$__hostRequire` deleted after evaluate:** Builtin proxy modules (`path`, `micromatch`) call `$__hostRequire` during their own `evaluate()` phase, triggered when `runeMod.evaluate()` walks the import graph. Removing `$__hostRequire` before that phase would break all builtins. Removing it afterward ensures rune code that runs post-evaluate can never reach the host's `require`.

- **Project allow replaces plugin allow; project deny merges:** `projectPerms?.allow ?? pluginAllow` means a project that sets `allow` replaces the plugin's list entirely, letting projects restrict plugins. Plugin deny always unions with project deny — neither can remove the other's deny entries.

- **`@plugin/**` auto-grant:** Plugin runes always get `fs.read:@plugin/**` injected into effective allow. This resolves to the plugin cache dir, not the project dir. Plugin runes that need to read project files must explicitly declare `fs.read:./**`.

## API Surface

| Namespace | Functions | Permission token |
|---|---|---|
| `utils.fs` | `read`, `exists`, `glob`, `write` | `fs.read:`, `fs.exists:`, `fs.glob:`, `fs.write:` |
| `utils.shell` | `(cmd, opts)` | `shell:<cmd>` |
| `utils.json` | `read`, `get`, `getAll` | inherits `fs.read:` |
| `utils.fetch` | `(url, opts)` | `fetch:<url>` |
| `utils.env` | `get`, `has` | `env:<source>:<key-glob>` |
| `utils.md` | Pure — no I/O | — |
| `utils.tree` | Pure — no I/O | — |
| `utils.section` | `create`, `match`, `selected` | — |
| `utils.vars` | `get` | — |
| `utils.rune` | `(key, args)` | inherits target rune's permissions |
| `utils.yaml` | `read`, `parse`, `stringify` | inherits `fs.read:` for `read` |
| `utils.xml` | `read`, `parse`, `stringify` | inherits `fs.read:` for `read` |
| `utils.archive` | `read`, `write` | `fs.read:`, `fs.write:` |
| `utils.cache` | `get`, `set`, `has`, `del`, `clear` | — |
| `utils.sqlite` | `query`, `queryAll`, `exec` | `fs.read:`, `fs.write:` |
| `utils.crypto` | `hashHex`, `hashBase64`, `uuid`, `hex`, `base64` | — |

## Rune Authoring

Every rune must export a `use` function with a **single `args` parameter** — the runner calls `use(parsedArgs)` with one argument (the parsed yargs result as a plain object). The old three-argument signature `use(dir, args, utils)` is broken at runtime: `dir` receives the args object, `args` and `utils` are `undefined`.

```js
import { md, section } from '@utils'

export async function use(args) {
  // args._         — positional arguments (string[])
  // args.verbose   — named flag value (if args() export is defined)
  // utils.fs.cwd() — absolute path to the project root (via globalThis.utils)
}
```

The `@utils` import resolves to `utils-bootstrap.js` inside the isolate. It re-exports every namespace from `globalThis.utils` as named exports, so `import { md, section, fs } from '@utils'` works. `globalThis.utils` is also still accessible directly.

**Typed arguments** — export an `args` function using the builder API:

```js
export async function args(b) {
  return b
    .option('-v, --verbose', 'Verbose output', false)
    .option('-c, --count <number>', 'Max results', 10)
    .positional('<target>', 'Target path')
    .example('crunes use myrune foo', 'Basic use')
    .build()
}
```

The runner calls `args(builder)` before `use(parsedArgs)` and passes the schema to yargs for parsing. If `args` is not exported, all positional arguments land in `parsedArgs._` as strings.

## Flows

- [[flows/use]] — owns the full execution path from CLI input to section output

## Gotchas & Debugging

- **`utils.section()` vs `utils.section.create()`:** `utils.section` is an object (`{ create, match, selected }`), not a function. Runes still calling `utils.section(name, data)` will throw `TypeError: utils.section is not a function` at runtime with no further context.

- **Module compilation order matters:** `mdMod`, `treeMod`, `utilsMod` must all be compiled and instantiated before any are evaluated. `utilsMod` imports from `mdMod` and `treeMod` — evaluating in the wrong order causes "module not linked" errors.

- **`isolateTimeoutMs` is per-`eval` call, not total wall-clock:** A rune making many sequential `utils.fs.read` calls can exceed real elapsed time while staying under the per-call limit. If a rune hangs, check for loops over large globs.

- **`utils.fs.glob` `onlyDirectories: true`:** Returns only directories. `onlyFiles: true` (default) returns only files. Both options are passed through to `fast-glob`.

- **`utils.json.get` returns the first match for a JSONPath expression.** Use `utils.json.getAll` for expressions that may match multiple nodes.

- **Lifecycle namespacing is mandatory in permissions:** A flat top-level `{ "allow": [...] }` in `plugin.json` or config produces an empty permission set silently. This was the root cause of a real bug where plugin runes appeared to have no permissions despite correct `plugin.json` authoring.

- **`normalizePermission` prepends `./`:** `fs.read:package.json` is normalized to `fs.read:./package.json`. A permission declared as `fs.read:./package.json` and a check for `package.json` (without `./`) will NOT match. Always use the normalized path in permission tokens.

- **`fetch:` and `env:` use custom matchers, not micromatch:** Do not add fetch or env patterns to the micromatch allow array. They are checked by `matchFetchPermission` and `matchEnvPermission` before the micromatch pass.

- **Shell permission matching is exact-prefix:** `shell:git log *` allows `git log --oneline -10` but not `git status`. The pattern is matched as a prefix against the full command string.

- **Plugin runes execute from the plugin cache dir, not the project dir:** `dir` passed to the rune is still the project root. `pluginDir` (used for permission resolution) is the plugin's cache directory. Confusing these is a common source of permission errors for plugin authors.
