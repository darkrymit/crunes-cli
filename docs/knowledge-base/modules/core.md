---
tags: [module]
---
# core

> Minimal shared domain: `loadConfig` (synchronous three-layer config loader with merge), `mergeConfigs`, `absolutizeEntryPaths`, `validateConfig`, the `config-writer` module, and `CircularRuneError` (thrown on recursive rune calls).

**Source:** `src/core/`
**Submodules:** none (flat module)
**Related:** [[modules/rune]], [[modules/plugin]], [[modules/template]], [[modules/docs]], [[modules/store]]

## Overview

`core` is intentionally minimal — it exists only to give `rune/resolver.js`, `plugin/`, `template/`, and `docs/` a shared home for configuration loading and error types without creating import cycles between those modules. It contains no domain logic of its own.

`loadConfig(dir)` merges three layers, lowest to highest: the global `<store>/config.json`, the project `.crunes/config.json`, and `.crunes/config.local.json` (a gitignored file for developer-local overrides). Each layer is validated as it is read, so callers always receive either valid config or an exception. The layering is designed so a personal global config can supply runes and plugin enablement everywhere, a project can override or opt out of any of it, and a developer's local file can do the same on top — none of which requires redeclaring the layer below.

A missing global layer is normal and silent. Invalid JSON in the global layer is a hard error naming the file: silently dropping that layer would make every global rune vanish with no explanation. `CRUNES_NO_GLOBAL=1` skips the layer entirely, which is what CI should set.

`absolutizeEntryPaths` runs on each layer **before** the merge, resolving that layer's own `path` fields against that layer's own base directory. This is what makes partial override correct: a project entry that supplies only `vars` inherits the absolute path of the global entry, rather than keeping a bare relative path that would later resolve against the wrong root. It also stamps a display-only `LAYER` symbol used by `crunes list` and `crunes doctor`.

`CircularRuneError` is thrown by `runRune` when the call stack already contains a rune key that is being resolved again, indicating an infinite recursion. The error message formats the full chain as arrows (e.g., `Circular rune call: release → m → release`), making it immediately clear which runes form the loop.

## Key Decisions

- **Merge strategy balances shared and local config:** Top-level primitives are overwritten by the higher layer. `runes`, `templates`, and per-entry `vars` are deep-merged — a higher layer can add entries or change one field without erasing the layer below. `permissions` are replaced per rune — the higher layer completely overrides for any rune it touches. This lets each layer add what it needs without redeclaring the structure beneath it.

- **`plugins` is a boolean map, not a union array:** `{"mkt@plug": true}`. A union array structurally cannot express "off" — with a global layer beneath it, a project could never disable a plugin that the global layer enabled. Legacy arrays are still read and coerced to all-`true`; the first write converts that file to map form. `enabledPluginKeys(config)` is the only correct way to read the enabled set, since a key set to `false` must not count.

- **Writers never persist a merged config:** `config-writer.js` reads raw file contents, mutates, and writes back. Persisting a merged object would write absolutized paths — and entries belonging to other layers — into whichever file was being edited.

- **Synchronous `readFileSync` for immediate error surfaces:** `loadConfig` uses synchronous I/O rather than async. All callers invoke it once at the start of a command before any async work begins. Sync I/O keeps call sites simple and makes errors surface immediately on the call stack rather than being swallowed by an unhandled rejection.

- **`validateConfig` is called automatically, not by callers:** Validation happens inside `loadConfig`, so no caller can accidentally skip it. A flat `{ "allow": [...] }` permission block is rejected before the caller ever sees the config. This eliminates a class of silent misconfiguration bugs where invalid config would produce no error but also no permitted I/O.

- **No config caching between calls:** Every invocation of `loadConfig(dir)` re-reads from disk. Config files are small, startup I/O is cheap, and caching would add invalidation complexity. In tests, this means config changes take effect between calls without restarting the process.

- **`CircularRuneError` message only — no chain array property:** The chain is formatted into the message string (e.g. `chain.join(' → ')`) but not stored as a property on the error object. Callers who need the raw chain must parse the message string.

## Gotchas & Debugging

- **`loadConfig` merges three files:** global `<store>/config.json`, then `config.json`, then `config.local.json`, each layer over the one before. `config.local.json` is gitignored by convention. There is no `<store>/config.local.json` — the global layer is already machine-local and has no shared counterpart to override.

- **A missing project config no longer throws:** `loadConfig` returns the global layer alone and marks the result `ROOTLESS`. Callers that wrapped it in `try/catch` to survive ENOENT simply never take the catch branch now; the catch still guards genuinely malformed JSON.

- **Rune entry paths coming out of `loadConfig` are absolute:** anything comparing them against a relative literal, or joining them onto a project root, is wrong. `resolveRuneFilePath` handles both forms — absolute verbatim, relative joined against the config dir for hand-built configs in tests.

- **Permissions must be lifecycle-scoped:** `{ "permissions": { "allow": [...] } }` is rejected by `validateConfig`. The correct form is `{ "permissions": { "run": { "allow": [...] } } }`. The error message names the misconfigured rune, making it easy to locate.

- **Project config path is always relative to `dir` — no search-upward logic:** `loadConfig(dir)` always reads from `join(dir, '.crunes', 'config.json')`. There is no walk-up-the-directory-tree search. Running `crunes run` from a subdirectory requires `--cwd` to point at the project root; otherwise that directory is simply treated as rootless and only global runes resolve. The global layer path *does* honour `$CRUNES_STORE`, and `--ccd` redirects only the project layer — the global layer still applies unless `CRUNES_NO_GLOBAL=1`.
