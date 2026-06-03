---
tags: [system]
---
# Architecture

> Feature-first module layout, sandboxed rune execution via isolated-vm, and a two-layer storage model separating the global plugin registry from per-project config.

## Technology Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js ≥ 20, ESM |
| Bundler | esbuild (single output `dist/cli.js`) |
| CLI framework | Commander.js |
| Sandbox | isolated-vm (V8 Isolate per rune invocation) |
| Test | Vitest |
| Deps | micromatch, fast-glob, chalk, @clack/prompts |

## Module Map

| Module | Purpose |
|---|---|
| `cli/` | Entry point bootstrap, Commander setup, general commands (version, doctor, completions) |
| `core/` | `loadConfig`, `mergeConfigs`, `validateConfig`, `CircularRuneError` — shared config loading and error types |
| `docs/` | Dynamic documentation engine: rune help, utils API reference, intro handbook |
| `marketplace/` | Marketplace source URL management and cached plugin index |
| `plugin/` | Plugin registry, install, uninstall, enable, disable, consent |
| `project/` | Project identity (`project.local.json`) and global reverse-lookup index (`projects.json`) |
| `rune/` | Key resolution, isolated-vm execution, utils API, permissions |
| `shared/` | `render.js`, `output.js` — cross-cutting utilities with no domain coupling |
| `store/` | Centralised path helpers for `~/.crunes/` store directory |
| `template/` | Rune template listing and scaffolding |
| `cache/` | Rune-visible key/value cache store backed by JSON files |
| `sqlite/` | Rune-visible SQLite database store |
| `job/` | Background job tracking for rune-spawned processes |

## Key Design Principles

### Isolated-VM sandbox

Every rune invocation runs in a fresh V8 isolate created via `isolated-vm` and torn down immediately after. The isolate cannot access Node.js built-in modules — all I/O is mediated through the `utils` bridge: dozens of granular async functions injected as `$__utils_*` References. References (not ExternalCopy) are required because callback functions cannot be serialized across the isolate boundary. There is no isolate pooling or reuse between invocations, which keeps cleanup simple and prevents state leakage. Adding a new `utils` capability requires implementing it in `api/`, injecting a Reference in `runner.js`, and wiring it up in `utils-bootstrap.js` — missing any of the three silently fails.

### Feature-first module layout

Code under `src/` is organized by feature domain, not by infrastructure layer. Each feature directory owns everything it needs: commands, domain logic, and sub-modules. Infrastructure concerns like `rune/api`, `rune/isolation`, and `rune/permissions` live inside the `rune/` feature, not at the top level. This co-location prevents the formation of a shared infrastructure layer that would create coupling cycles and make it difficult to understand which feature is responsible for what. The alternative — a layered architecture with a top-level `infrastructure/` directory — would force multiple features to import from shared modules, creating tight coupling.

### Two-layer storage

Persistent data splits across two storage layers. The global store (`~/.crunes/`) is shared across all projects on the machine: installed plugins, marketplace indices, pnpm packages, job records, and cache/sqlite data all live here. The project config (`.crunes/config.json`) is per-project: registered runes, enabled plugins, permission overrides, and variables. Project identity (`.crunes/project.local.json`) is a gitignored per-project file holding a stable ID and alias, synced to `~/.crunes/projects.json` on first use. This split means plugins can be installed once globally but enabled, disabled, or restricted per project — a project can override a plugin's permissions without affecting any other project.

### esbuild single bundle

`npm run build` produces a single `dist/cli.js`. All of `src/` is bundled into it. The only dynamic `import()` calls at runtime are Commander action handlers, lazy-loaded to keep startup fast. Rune files (`.crunes/runes/*.js` and plugin runes) are NOT bundled — they are loaded from disk at runtime by the isolate. `dist/cli.js` is gitignored and never committed. CI builds it dynamically from `src/` on tag push. Never hand-edit `dist/` — it is overwritten on every build.

### Node 20+ snapshot workaround

`isolated-vm` is incompatible with V8's startup snapshot mechanism. `cli.js` detects whether Node.js 20 or higher is running without `--no-node-snapshot` in `process.execArgv` and, if so, re-spawns itself with the flag before `isolated-vm` is ever imported. The re-spawn happens as synchronous code in the module body — long before any lazy imports. This makes the workaround transparent to users: the parent exits immediately, the child continues with the flag set, and all output comes from the child.

### Environment-driven configuration and test isolation

Two environment variables shape system behavior. `CRUNES_STORE` overrides the store root, defaulting to `~/.crunes/`. Every test that writes to the store sets this variable to a temp directory in `beforeEach` and clears it in `afterEach` — this is the foundation of test isolation across the entire test suite. `CRUNES_NO_TIMEOUT` disables the 30-second per-eval isolate timeout when set to `1`. Child process spawns from `rune.exec` and `rune.job.start` set this variable so the child's isolate runs without a timeout, preventing a slow child rune from cascading into a timeout failure in the parent.

## Gotchas & Debugging

- **`dist/` must be rebuilt after `src/` changes:** Editing source files has no effect on CLI behavior until `npm run build` is run. Rune files (`.crunes/runes/`) are read from disk at runtime and do NOT require a rebuild.

- **The global store respects `CRUNES_STORE`:** `getStorePath()` returns `process.env.CRUNES_STORE ?? path.join(os.homedir(), '.crunes')`. Tests depend on this — any module that computes store paths independently and ignores the variable breaks test isolation.

- **The Node re-spawn shows as a double process:** On Node 20+, every `crunes` invocation briefly shows as two processes in `ps` or process monitors. The parent spawns the child and exits; all output and errors come from the child. This is expected.
