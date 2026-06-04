# rune

Everything related to executing context runes: key resolution, sandboxed execution, and the utils API exposed to rune code. Full docs: `docs/knowledge-base/modules/rune.md`

## Files

- **resolver.js** — `runRune(dir, config, key, args, opts, callStack?)` — resolves a rune key (local, plugin-prefixed, or auto-discovered from enabled plugins) and dispatches to the appropriate runner. `getRune(config, key)` — retrieves a rune entry from config. `normaliseRune(entry)` — normalizes a rune entry object. Handles circular call detection via `CircularRuneError`.

## Submodules

- **api/** — The `utils` object injected into every rune at runtime: `md`, `tree`, `section`, `fs`, `shell`, `json`, `yaml`, `xml`, `http`, `ws`, `env`, `vars`, `archive`, `cache`, `sqlite`, `db`. Additional namespaces (`codec`, `crypto`, `time`, `rune`) are injected directly by the runner via host References and exposed through the bootstrap. `rune.js` and `shell.js` also export the host-side `RuneSession`/`ShellSession` classes used by the runner to manage subprocess lifecycle with deferred `open()`.
- **isolation/** — Sandboxed VM lifecycle via `isolated-vm`; in-isolate bootstrap stubs and ESM resolver.
- **permissions/** — Effective permission computation and per-operation checkers (http fetch, env, store, http server, ws client, ws server).
- **commands/** — CLI handlers: `run`, `list`, `create`, `check`, `benchmark`.

## Related Modules

- `core` — Provides `loadConfig` and `CircularRuneError`.
- `plugin` — Plugin runes are resolved via `loadRegistry` / `loadPluginJson` and executed via `executePluginRune`.
- `shared` — `render` formats `Section[]` output to stdout; `output` is used for error reporting.
- `docs` — `rune.js` handler calls `getArgsSchema` from `isolation/runner.js` to render rune help text.
