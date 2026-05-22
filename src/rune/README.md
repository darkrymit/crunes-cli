# rune

Everything related to executing context runes: key resolution, sandboxed execution, and the utils API exposed to rune code. Full docs: `docs/knowledge-base/modules/rune.md`

## Key Files

- **resolver.js** — `runRune(dir, config, key, args, opts)` — resolves a rune key (local, plugin-prefixed, or auto-discovered from enabled plugins) and dispatches to the appropriate runner. Handles circular call detection.

## Submodules

- **api/** — The `utils` object injected into every rune at runtime: `md`, `tree`, `fs`, `shell`, `json`, `fetch`, `env`, `vars`, `yaml`, `xml`, `archive`, `cache`, `sqlite`, `crypto`.
- **isolation/** — Sandboxed VM lifecycle via `isolated-vm`; in-isolate bootstrap stubs and ESM resolver.
- **permissions/** — Effective permission computation and per-operation checkers (fs, http, env, shell).
- **commands/** — CLI handlers: `use`, `list`, `create`, `check`, `bench`.

## Related Modules

- `core` — Provides `loadConfig` and `CircularRuneError`.
- `plugin` — Plugin runes are resolved via `loadRegistry` / `loadPluginJson` and executed via `executePluginRune`.
- `shared` — `render` formats `Section[]` output to stdout; `output` is used for error reporting.
- `help` — `rune.js` handler calls `getArgsSchema` from `isolation/runner.js` to render rune help text.
