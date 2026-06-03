---
tags: [module]
---
# core

> Minimal shared domain: `loadConfig` (synchronous config loader with merge), `mergeConfigs`, `validateConfig`, and `CircularRuneError` (thrown on recursive rune calls).

**Source:** `src/core/`
**Submodules:** none (flat module)
**Related:** [[modules/rune]], [[modules/plugin]], [[modules/template]], [[modules/docs]]

## Overview

`core` is intentionally minimal — it exists only to give `rune/resolver.js`, `plugin/`, `template/`, and `docs/` a shared home for configuration loading and error types without creating import cycles between those modules. It contains no domain logic of its own.

`loadConfig(dir)` reads `.crunes/config.json` from the project root, optionally reads `.crunes/config.local.json` (a gitignored file for developer-local overrides), deep-merges them together, validates the result, and returns the combined config object. The merge strategy is designed so that a developer's local config can add personal rune shortcuts and overrides without modifying the shared config that lives in version control. Because `loadConfig` validates before returning, callers always receive either valid config or an exception — they never silently receive invalid config.

`CircularRuneError` is thrown by `runRune` when the call stack already contains a rune key that is being resolved again, indicating an infinite recursion. The error message formats the full chain as arrows (e.g., `Circular rune call: release → m → release`), making it immediately clear which runes form the loop.

## Key Decisions

- **Merge strategy balances shared and local config:** Top-level primitives are overwritten by local values. `runes` and `vars` are deep-merged per entry — local can add new entries without erasing shared entries. `permissions` are replaced per rune by local — local completely overrides shared for any rune it touches. `plugins` is a union of both arrays, deduplicated. This design lets `config.local.json` add personal shortcuts without requiring developers to redeclare the entire shared structure.

- **Synchronous `readFileSync` for immediate error surfaces:** `loadConfig` uses synchronous I/O rather than async. All callers invoke it once at the start of a command before any async work begins. Sync I/O keeps call sites simple and makes errors surface immediately on the call stack rather than being swallowed by an unhandled rejection.

- **`validateConfig` is called automatically, not by callers:** Validation happens inside `loadConfig`, so no caller can accidentally skip it. A flat `{ "allow": [...] }` permission block is rejected before the caller ever sees the config. This eliminates a class of silent misconfiguration bugs where invalid config would produce no error but also no permitted I/O.

- **No config caching between calls:** Every invocation of `loadConfig(dir)` re-reads from disk. Config files are small, startup I/O is cheap, and caching would add invalidation complexity. In tests, this means config changes take effect between calls without restarting the process.

- **`CircularRuneError` message only — no chain array property:** The chain is formatted into the message string (e.g. `chain.join(' → ')`) but not stored as a property on the error object. Callers who need the raw chain must parse the message string.

## Gotchas & Debugging

- **`loadConfig` merges two files:** It reads `config.json` first, then `config.local.json` if present, and deep-merges local over shared. `config.local.json` is gitignored by convention — it is for developer-local overrides. If the local file is accidentally committed, merge conflicts become likely.

- **Missing `.crunes/config.json` throws ENOENT — no empty-config fallback:** There is no fallback to an empty object. The `run` command wraps this with a helpful message; other callers that do not wrap it propagate to the top-level uncaught exception handler, which may print a terse and confusing error.

- **Permissions must be lifecycle-scoped:** `{ "permissions": { "allow": [...] } }` is rejected by `validateConfig`. The correct form is `{ "permissions": { "run": { "allow": [...] } } }`. The error message names the misconfigured rune, making it easy to locate.

- **Config path is always relative to `dir` — no search-upward logic:** `loadConfig(dir)` always reads from `join(dir, '.crunes', 'config.json')`. There is no environment variable override and no walk-up-the-directory-tree search. Running `crunes run` from a subdirectory requires `--cwd` to point at the project root; otherwise `loadConfig` fails with ENOENT from the wrong directory.
