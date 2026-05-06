---
tags: [flow]
---
# `crunes use` Execution Flow

> A rune key is resolved, the rune file is executed in a sandbox, and sections are rendered to stdout.

**Modules:** [[modules/rune]], [[modules/rune.isolation]], [[modules/rune.permissions]], [[modules/rune.api]], [[modules/plugin]], [[modules/shared]]

## Overview

The `use` command parses one or more `$key=args::sections` tokens. For each token, it calls `runRune()` which resolves the key (local or plugin), computes permissions, and dispatches to `runRuneInIsolate`. The rune's `use()` function runs in a fresh V8 isolate with the utils bridge injected. Returned sections are filtered by the `::sections` pattern (if any) and rendered to stdout.

## Walkthrough

```
crunes use <token> [-a <token>]
          │
          ▼
  commands/use.js: parseKeyToken → { key, args, sections }
          │
          ▼
  core: runRune(dir, config, key, args, { sections })
          │
          ├─ local: prefix? → skip plugin lookup
          ├─ config.runes[key]? → local rune path
          └─ plugin key (namespace:name or auto-discover)
                    │
                    ▼
          rune/resolver.js: resolvePluginRune → registry + manifest
                    │
                    ▼
          rune/isolation/runner.js: runRuneInIsolate
            1. Create isolate + context
            2. Inject $__hostRequire, compile static modules (md, tree, utils, console)
            3. Inject $__utils_* References (fs, shell, json, fetch, env, vars, rune, section)
            4. Delete $__hostRequire
            5. Compile rune ESM module
            6. Evaluate rune + import graph
            7. Call use(dir, args, utils)
            8. Collect sections via $__addSection callback
                    │
                    ▼
  commands/use.js: micromatch filter by ::sections
                    │
                    ▼
  shared/render.js: renderSection(section) → stdout
```

## Error Paths

- **Unknown key** — `runRune` returns `null`; `use.js` prints available keys and exits 1.
- **Circular rune call** — `CircularRuneError` thrown by resolver with full call chain.
- **Permission denied** — `PermissionError` thrown inside isolate; propagates as rune failure.
- **Rune throws** — caught by `use.js`; message printed; `--fail-fast` exits immediately, otherwise continues with remaining tokens.
- **Ambiguous plugin** — multiple plugins provide the same bare key; `use.js` prints the full keys and exits 1.

## Key Decisions

- **Section filter applied post-execution, not pre:** The `::sections` glob filter is applied in `use.js` after the rune returns, not passed as a skip hint to the isolate. The rune still executes fully. This is intentional — `utils.section.match(name)` lets rune authors opt into early skipping if they want efficiency; it's not enforced by the framework.
