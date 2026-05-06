---
tags: [module]
---
# rune/api

> The `utils` object injected into every rune at runtime. Each sub-module provides one namespace of the API.

**Source:** `src/rune/api/`
**Related:** [[modules/rune.isolation]], [[modules/rune]]

## Overview

`createUtils(dir, permChecker, opts)` assembles the full `utils` object from its constituent modules. Each module (fs, shell, json, fetch, env, vars, md, tree, section) contributes one namespace. The returned object is what rune authors interact with via the `utils` parameter of their `use(dir, args, utils)` function.

I/O modules (fs, shell, fetch, env) call `permChecker` before performing any operation and throw a `PermissionError` if denied. Pure modules (md, tree, section) have no side effects.

## Key Decisions

- **Host-side + isolate-side dual update:** Every utils capability has two sides. Adding a new function requires: (1) implementing it in `src/rune/api/<module>.js`, (2) injecting it as a `$__utils_<name>` Reference in `injectUtils()` in `runner.js`, (3) exposing it in `utils-bootstrap.js` inside the isolate. Missing either side silently fails — the rune sees `undefined` for the function or the host is never called.

- **`utils.section` is an object, not a function:** `utils.section = { create, match, selected }`. Old runes calling `utils.section(name, data)` will throw. `section.create(name, data, opts)` is the only correct form.

- **`utils.rune(key, args)` enables rune composition:** A rune can call other runes via `utils.rune`. The core resolver handles key resolution identically to a top-level `crunes use` call. Circular calls are detected via `_callStack` and throw `CircularRuneError`. Child rune calls do NOT inherit the section filter — they always run with `sections: null`.

## Gotchas & Debugging

- **`utils.fs.glob` options:** `onlyDirectories: true` returns only directories. `onlyFiles: true` (default) returns only files. Both options are passed through to `fast-glob`.

- **`utils.json.get` returns the first match for a JSONPath expression.** Use `utils.json.getAll` for expressions that may match multiple nodes.

- **`utils.env.get` reads from both `process.env` and `.env` files.** The `source` permission token (`env:<source>:<key-glob>`) controls which source is allowed. `process` for `process.env`, `dotenv` for `.env` file parsing.

## API Surface

| Namespace | Functions | Permission token |
|---|---|---|
| `utils.fs` | `read`, `exists`, `glob`, `write` | `fs.read:`, `fs.exists:`, `fs.glob:`, `fs.write:` |
| `utils.shell` | `(cmd, opts)` | `shell:<cmd>` |
| `utils.json` | `read`, `get`, `getAll` | inherits `fs.read:` |
| `utils.fetch` | `(url, opts)` | `fetch:<url>` |
| `utils.env` | `get`, `has` | `env:<source>:<key-glob>` |
| `utils.md` | Pure — no I/O | — |
| `utils.tree` | Pure — no I/O | — |
| `utils.section` | `create`, `match`, `selected` | — |
| `utils.vars` | `get` | — |
| `utils.rune` | `(key, args)` | inherits target rune's permissions |
