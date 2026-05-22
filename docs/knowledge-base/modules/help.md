---
tags: [module]
---
# help

> Rune help rendering: loads a rune's typed `args()` schema and formats it as a human-readable usage block or machine-readable JSON.

**Source:** `src/help/`
**Submodules:** `commands/` (rune)
**Related:** [[modules/rune]], [[modules/cli]]

## Overview

`crunes help rune <key>` resolves a rune entry, loads its `args()` export via `getArgsSchema` (which runs the export inside a fresh isolate), and passes the result to `formatHelp` for display.

`formatter.js` formats a schema object into a Usage/Options/Examples block. `commands/rune.js` handles the CLI lifecycle: config loading, key resolution, `getArgsSchema` invocation, and output (md or JSON).

## Concepts

**`getArgsSchema(runePath, perms, dir, opts)`:** Defined in `rune/isolation/runner.js`. Creates a throwaway isolate, evaluates the rune module, calls `args(builder)` if exported, and returns the schema object. If `args` is not exported, returns `null`. Used by both `help` and by `runRuneInIsolate` before calling `use(parsedArgs)`.

**Output formats:**
- `--format md` (default) — human-readable usage block: Usage line, positionals, Options table, Examples.
- `--format json` — raw array of `{ key, name, description, schema }` objects; consumed by tooling.

**Multiple keys via `-a`:** `crunes help rune foo -a bar` loads and formats both runes in sequence.

## Gotchas & Debugging

- **`getArgsSchema` runs the rune in a sandboxed isolate:** Even for a simple `args()` export, the rune file is fully evaluated. If the rune has a side-effectful module body (unusual but possible), those side effects run during `help`. Permission checks apply — a rune with restrictive permissions that are violated during `args()` evaluation will fail.

- **Unknown key logs a warning and exits 1:** `crunes help rune unknown-key` prints a warning per missing key and exits 1 at the end. It does not throw immediately, so if multiple keys are provided it processes all of them before exiting.
