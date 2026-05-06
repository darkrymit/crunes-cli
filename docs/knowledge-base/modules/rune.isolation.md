---
tags: [module]
---
# rune/isolation

> Sandboxed VM lifecycle via `isolated-vm`. Manages isolate creation, bootstrap, and teardown for local and plugin runes.

**Source:** `src/rune/isolation/`
**Related:** [[modules/rune.api]], [[modules/rune.permissions]], [[modules/rune]]

## Overview

Every rune runs inside a fresh V8 isolate via `isolated-vm`. `runner.js` owns the full lifecycle: create isolate → compile static modules (md, tree, utils, console) → inject `$__` global bridges → resolve and compile the rune ESM module → evaluate → collect sections. Plugin runes go through `executePluginRune`, which resolves the plugin path from the registry before delegating to the same runner.

The utils bridge works via `isolated-vm` References — host-side async functions are injected as `$__utils_fs_read`, `$__utils_shell`, etc. in the global context. The in-isolate `utils-bootstrap.js` wraps these References into the final `utils` object the rune author sees.

## Key Decisions

- **Reference bridge, not ExternalCopy:** `utils` methods are async. `ExternalCopy` only works for serializable data — it cannot carry promises or callbacks. References allow calling host-side async functions from inside the isolate and awaiting the result. Any new utils capability must follow this Reference pattern in `injectUtils()`.

- **Static modules compiled from source strings:** `md.js`, `tree.js`, `utils-bootstrap.js`, and `console-bootstrap.js` are embedded as source strings at build time (via esbuild) and compiled into the isolate via `compileModule`. This keeps them fully sandboxed — they cannot reach the host filesystem — while still being real ESM modules with imports between them.

- **`$__hostRequire` deleted after evaluate:** The builtin proxy modules (e.g. `path`, `micromatch`) call `$__hostRequire` during their own `evaluate()` phase, which is triggered when `runeMod.evaluate()` walks the import graph. Removing `$__hostRequire` before that phase would break all builtins. Removing it afterward ensures rune code that runs post-evaluate can never reach the host's `require`.

- **Dynamic lifecycle dispatch:** `runRuneInIsolate` accepts a `lifecycle` option (default: `'use'`). The rune source is patched to capture `globalThis[lifecycle]` as `globalThis.__crunes_target`. This means the same runner works for any future lifecycle (e.g. `cast`) without forking.

## Gotchas & Debugging

- **`utils.section()` vs `utils.section.create()`:** The bootstrap module exports the object form (`{ create, match, selected }`). Runes still using the old function-call form `utils.section(name, data)` will throw `TypeError: utils.section is not a function` at runtime with no further context.

- **Module compilation order matters:** `mdMod`, `treeMod`, `utilsMod` must all be compiled and instantiated before any are evaluated. `utilsMod` imports from `mdMod` and `treeMod` — evaluating in the wrong order causes "module not linked" errors.

- **`isolateTimeoutMs` is per-`eval` call, not total wall-clock:** A rune making many sequential `utils.fs.read` calls can exceed real elapsed time while staying under the per-call limit. If a rune hangs, check for loops over large globs.

- **Plugin runes execute from the plugin cache dir, not the project dir:** `dir` passed to the rune is still the project root. `pluginDir` (used for permission resolution) is the plugin's cache directory. Confusing these two is a common source of permission errors for plugin authors.
