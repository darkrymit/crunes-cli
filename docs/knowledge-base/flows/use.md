---
tags: [flow]
---
# `crunes use` Execution Flow

> A rune key is resolved, the rune file is executed in a sandbox, and sections are rendered to stdout.

**Modules:** [[modules/rune]], [[modules/cli]], [[modules/plugin]], [[modules/shared]]

## Overview

The `use` command parses one or more `key=args::sections` tokens (via `-a` for additional tokens). For each token, it calls `runRune()` which resolves the key (local or plugin), computes permissions, and dispatches to `runRuneInIsolate`. If the rune exports an `args()` function, that schema is used to parse typed arguments before `use(parsedArgs)` is called. Returned sections are filtered by the `::sections` pattern (if any) and rendered to stdout.

## Walkthrough

```
crunes use <token> [-a <token>...]
          │
          ▼
  commands/use.js: parseKeyToken → { key, args, sections }
  (strips ::sections filter, splits =arg1,arg2, returns bare key)
          │
          ▼
  rune/resolver.js: runRune(dir, config, key, args, { sections, configDir })
          │
          ├─ project: prefix? → strip prefix, set localOnly=true
          ├─ plugin:name key + localOnly=false? → resolvePluginRune
          │         → registry lookup → executePluginRune
          ├─ config.runes[key]?.plugin field? → alias → re-dispatch resolvePluginRune
          │         → executePluginRune (with alias entry's own permissions/vars)
          ├─ config.runes[key] with path? → runRuneInIsolate (local rune)
          └─ bare key, no config entry? → resolveRuneFromPlugins
                    → scan all enabled plugins → executePluginRune
                    (throws if multiple plugins match same bare key)
                    │
                    ▼
          rune/isolation/runner.js: runRuneInIsolate / executePluginRune
            1. computeEffectivePermissions(base, projectOverride, 'use')
            2. createUtils(dir, checkPermission, ...)
            3. Create isolate + context
            4. Inject $__projectDir, $__vars
            5. Inject $__hostRequire; compile static modules (md, tree, utils, console)
            6. Inject $__utils_* References:
                 fs (read, exists, glob, write, copy)
                 shell, section (create, match, selected), rune
                 json (read, get, getAll, write)
                 yaml (read, write), xml (read, write)
                 fetch, env (get, has)
                 archive (unzip, zip, untar, tar)
                 cache (open, set, get, delete, clear)
                 sqlite (open, query, get, exec, close)
               Inject $__crypto_* References (hash_hex, hash_base64, uuid, hex, base64)
            7. Delete $__hostRequire
            8. Compile rune ESM module
            9. Evaluate rune + import graph
           10. Call args(builder) if exported → parse rawArgs via args-parser.js
           11. Call use(parsedArgs)
           12. Collect sections via $__addSection callback
           13. normaliseResult → always returns Section[]
                    │
                    ▼
  commands/use.js: micromatch filter by ::sections (if filter present)
                    │
                    ▼
  --format md  → shared/render.js: renderSection(section) → stdout
  --format json → JSON.stringify(allSections) → stdout
```

## Error Paths

- **Unknown key** — `runRune` returns `null`; `use.js` prints available keys and exits 1.
- **Circular rune call** — `CircularRuneError` thrown by resolver with full call chain.
- **Permission denied** — `PermissionError` thrown inside isolate; propagates as rune failure.
- **Rune throws** — caught by `use.js`; message printed; `--fail-fast` exits immediately, otherwise continues with remaining tokens.
- **Ambiguous bare key** — multiple enabled plugins expose the same bare key; resolver throws; `use.js` prints full `plugin:key` forms and exits 1.
- **Plugin alias not enabled** — config entry has `plugin` field pointing to a plugin that isn't enabled/installed; resolver throws.

## Key Decisions

- **Section filter applied post-execution, not pre:** The `::sections` glob filter is applied in `use.js` after the rune returns, not passed as a skip hint to the isolate. The rune still executes fully. This is intentional — `section.match(name)` lets rune authors opt into early skipping if they want efficiency; it's not enforced by the framework.

- **`args()` schema is optional:** If a rune does not export `args`, rawArgs are passed through `yargs-parser` with no schema — all positionals land in `parsedArgs._` as strings. This keeps simple runes simple.

- **`normaliseResult` always returns an array:** `null` → `[]`, single object → `[obj]`, array → pass-through. Rune authors can return a single section or an array; consumers always get an array.

- **All tokens collected before rendering:** `use.js` runs all tokens in sequence and accumulates `allSections` before writing to stdout. This means `--format json` produces one JSON array for all tokens combined, not one object per token.
