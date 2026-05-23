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
- **`commands/`** — CLI handlers: `use`, `list`, `create`, `check`, `bench`. All key-accepting commands (`use`, `check`, `bench`) share the same `parseKeyToken` parser from `use.js` — they all support the `[prefix:]name[=arg1,arg2][::section1,section2]` token syntax. `bench` requires a key (no fallback to "run all"), supports `--runs <n>` to average multiple timed runs, and `--warmup` to execute one discarded run before timing starts.

## Concepts

**Key resolution tiers** (in order, first match wins):
1. `local:` prefix → skip plugin lookup entirely, check project config only.
2. `plugin:name` prefix → resolve directly by plugin name from the global registry (`resolvePluginRune`).
3. Bare key → check project config first (`config.runes[key]`), then auto-discover from all enabled plugins (`resolveRuneFromPlugins`).

**Plugin alias entries:** A config entry with a `plugin` field instead of a `path` field is an alias (`{ plugin: "pluginBareName:runeKey" }`). `runRune` re-dispatches through `resolvePluginRune`, applying the alias entry's own `permissions` and `vars` if present (overriding the plugin's declared values).

**Result normalisation:** `normaliseResult` ensures `runRune` always returns an array. `null` → `[]`, a single object → `[obj]`, an array → pass-through.

**Circular call detection:** `_callStack` is an array of keys in the current call chain. If `_callStack.includes(key)`, `CircularRuneError` is thrown with the full chain. Child rune calls (via `rune.use`) pass `nextStack` recursively but reset `sections` to `null`.

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

All namespaces are available as named exports from `@utils` inside the isolate. The full export list from `utils-bootstrap.js` line 164:
```js
export const { fs, shell, section, rune, json, yaml, xml, fetch, env, vars, archive, cache, sqlite, crypto, ws, time } = globalThis.utils
export { md, tree }
```

| Namespace | Methods | Permission token |
|---|---|---|
| `fs` | `cwd()`, `read`, `exists`, `glob`, `write`, `copy`, `replace` | `fs.read:`, `fs.write:`, `fs.glob:` |
| `shell` | `(cmd, opts)` | `shell:<cmd-prefix>` |
| `json` | `read`, `get`, `getAll`, `write`, `modify` | inherits `fs.read:` / `fs.write:` |
| `yaml` | `read`, `write`, `modify` | inherits `fs.read:` / `fs.write:` |
| `xml` | `read`, `write`, `modify` | inherits `fs.read:` / `fs.write:` |
| `fetch` | `(url, opts)` | `fetch:<METHOD>:<url>` |
| `env` | `get`, `has` | `env:<source>:<key-glob>` |
| `vars` | `get`, `has` | — |
| `md` | Pure markdown builders | — |
| `tree` | Pure tree builders | — |
| `section` | `create`, `match`, `selected` | — |
| `rune.use` | `(key, args?)` | inherits target rune's permissions |
| `rune.spawn` | `(key, args?)` → `{ id }` | `rune.spawn` |
| `rune.kill` | `(id, signal?)` | `rune.kill` |
| `rune.exists` | `(id)` → `boolean` | `rune.exists` |
| `time` | `time.after(ms)` — resolve after ms milliseconds | — |
| `archive` | `unzip`, `zip`, `untar`, `tar` | `fs.read:`, `fs.write:` |
| `cache` | `open(location, name?)` → handle | `cache.read:`, `cache.write:` |
| `sqlite` | `open(location, name?)` → db | `sqlite.read:`, `sqlite.write:` |
| `crypto` | `hash.hex`, `hash.base64`, `uuid`, `hex`, `base64` | — |

**`fs.replace`** is implemented in `utils-bootstrap.js`, not `api/fs.js` — it's a read+write composite: reads the file, runs `String.replace(regex, replacement)`, writes back.

**`json.modify` / `yaml.modify` / `xml.modify`** have host-side implementations in `api/json.js`, `api/yaml.js`, `api/xml.js`, but those are NOT the versions runes call. Inside the isolate, `utils-bootstrap.js` has separate implementations that call `globalThis.utils.fs.exists` → `read` → `write` in sequence. They are NOT injected as host References — they run entirely inside the isolate. Callbacks receive `(data, { exists })` and can return the new value or mutate in place (returning `undefined` preserves the mutated object).

**`cache.open` / `sqlite.open`** — the host-side implementations are `openHandle()` on the respective api class, but `utils-bootstrap.js` wraps them as `open()`. Inside the isolate these are async because `open` obtains a handle ID from the host and stores it; subsequent `get`/`set`/`query` calls reference the ID.

**Virtual location tokens** for `cache` and `sqlite` (`resolvePath` in `api/utils.js`):

| Token | Resolves to | Available in |
|---|---|---|
| `@project-cache` | `<store>/cache/projects/<project-key>` | Local + plugin runes |
| `@project-plugin-cache` | `<store>/cache/projects/<key>/plugins/<pluginId>` | Plugin runes only |
| `@plugin-cache` | `<store>/cache/plugins/<pluginId>` | Plugin runes only |
| `@project-sqlite` | `<store>/sqlite/projects/<project-key>` | Local + plugin runes |
| `@project-plugin-sqlite` | `<store>/sqlite/projects/<key>/plugins/<pluginId>` | Plugin runes only |
| `@plugin-sqlite` | `<store>/sqlite/plugins/<pluginId>` | Plugin runes only |

**Auto-grants** (`getAutoPermits` in `api/utils.js`):
- Local runes: `fs.read:.crunes/**`
- Plugin runes: `fs.read:@plugin/**`, `fs.write:@plugin/**`, plus `cache.*` and `sqlite.*` for all `@plugin-*` and `@project-plugin-*` virtual stores

## Rune Authoring

Every rune must export a `use` function with a **single `args` parameter** — the runner calls `use(parsedArgs)` with one argument (the parsed yargs result as a plain object). The old three-argument signature `use(dir, args, utils)` is broken at runtime: `dir` receives the args object, `args` and `utils` are `undefined`.

```js
import { md, section } from '@utils'

export async function use(args) {
  // args._       — positional arguments (string[])
  // args.verbose — named flag value (if args() export is defined)
  // fs.cwd()     — absolute path to the project root
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

- **`section()` vs `section.create()`:** `section` is an object (`{ create, match, selected }`), not a function. Runes still calling `section(name, data)` or `utils.section(name, data)` will throw `TypeError: section is not a function` at runtime with no further context.

- **Module compilation order matters:** `mdMod`, `treeMod`, `utilsMod` must all be compiled and instantiated before any are evaluated. `utilsMod` imports from `mdMod` and `treeMod` — evaluating in the wrong order causes "module not linked" errors.

- **`isolateTimeoutMs` is per-`eval` call, not total wall-clock:** A rune making many sequential `fs.read` calls can exceed real elapsed time while staying under the per-call limit. If a rune hangs, check for loops over large globs.

- **`fs.glob` `onlyDirectories: true`:** Returns only directories. `onlyFiles: true` (default) returns only files. Both options are passed through to `tinyglobby`. Absolute patterns throw immediately.

- **`json.get` returns the first JSONPath match.** Use `json.getAll` for expressions that may match multiple nodes.

- **`json.modify` / `yaml.modify` / `xml.modify` callback semantics:** The callback receives `(data, { exists })`. If the callback returns a value, that replaces the entire file content. If it returns `undefined` (implicit or explicit), the (mutated) `data` argument is used. Forgetting to `return` the new object is a common bug when building a new structure instead of mutating.

- **`cache.open` and `sqlite.open` are async:** They negotiate a handle ID with the host. Forgetting `await` before `open()` means all subsequent `.get()`/`.set()` calls operate on a Promise, not a handle — they will throw silently.

- **`@project-plugin-cache` / `@project-plugin-sqlite` require a plugin context:** Calling these from a local rune throws `Error: @project-plugin-cache requires a plugin context`. Use `@project-cache` / `@project-sqlite` for local runes.

- **`env.get` only resolves keys that match a declared `env:` permission pattern.** A key not covered by any `allow` pattern returns `undefined` (or the fallback), even if the key exists in `process.env`. There is no "env access denied" error — it silently falls through to the fallback.

- **`env:` permission source is a filename, not `process.env`:** `env:process:KEY` reads `process.env`. `env:.env:KEY` reads the project's `.env` file. Using `env:KEY` (missing the source segment) produces a pattern that never matches and silently returns undefined.

- **Lifecycle namespacing is mandatory in permissions:** A flat top-level `{ "allow": [...] }` in `plugin.json` is rejected at install time — `validatePluginJson` throws `plugin.json: rune "X" must have lifecycle-scoped permissions (e.g. permissions.use.allow)`. Project config overrides are not validated the same way and silently produce an empty set if a flat `allow` is used there.

- **`normalizePermission` prepends `./`:** `fs.read:package.json` is normalized to `fs.read:./package.json`. A permission declared as `fs.read:./package.json` and a check for `package.json` (without `./`) will NOT match. Always use the normalized path in permission tokens.

- **`fetch:` and `env:` use custom matchers, not micromatch:** Do not add fetch or env patterns to the micromatch allow array. They are checked by `matchFetchPermission` and `matchEnvPermission` before the micromatch pass.

- **Shell permission matching is exact-prefix:** `shell:git log *` allows `git log --oneline -10` but not `git status`. The pattern is matched as a prefix against the full command string.

- **Plugin runes execute from the plugin cache dir, not the project dir:** `dir` passed to the rune is still the project root. `pluginDir` (used for permission resolution) is the plugin's cache directory. Confusing these is a common source of permission errors for plugin authors.
