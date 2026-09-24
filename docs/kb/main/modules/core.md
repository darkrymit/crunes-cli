---
type: module
title: core
description: Three-layer config loading, the merge rules that decide what each layer may override, path absolutization per layer, and the circular-call error — deliberately holding no domain logic of its own.
tags: [module, configuration]
resource: src/core/
---

# core

The minimum `rune/`, `plugin/`, `template/` and `docs/` all need in order not to import one another. It is intentionally close to empty and contains no domain logic — content arriving here wanting some belongs in a feature instead, per [the feature-first layout](/patterns/feature-first-layout.md).

## Three layers

`loadConfig(dir)` merges, lowest to highest:

1. `<store>/config.json` — personal, machine-wide
2. `.crunes/config.json` — the project
3. `.crunes/config.local.json` — gitignored, developer-local

Each layer is validated as it is read, so a caller receives valid config or an exception, never something in between. The layering exists so a personal global config can supply runes and plugin enablement everywhere, a project can override or opt out of any of it, and a developer can do the same again on top — **none of which requires redeclaring the layer below.**

A missing global layer is normal and silent. *Invalid JSON* in the global layer is a hard error naming the file, because silently dropping it would make every global rune vanish with no explanation. `CRUNES_NO_GLOBAL=1` skips the layer entirely, which is what CI should set.

There is no `<store>/config.local.json`: the global layer is already machine-local and has nothing shared to override.

## The merge rules

| Key | Rule | Why |
|---|---|---|
| top-level primitives | higher layer wins | no meaningful merge exists |
| `runes`, `templates`, per-entry `vars` | deep merge | a layer adds an entry or changes one field without erasing the one beneath |
| `permissions` | replaced per rune | a project that touches a rune's grants owns them entirely, which is what lets it *restrict* |
| `plugins` | boolean map, merged | `false` must be able to override `true` |

**`plugins` is a map, not a union array.** An array structurally cannot express *off*: with a global layer beneath it, a project could never disable something the layer above enabled. Legacy arrays are read and coerced to all-`true`, and the first write converts the file. `enabledPluginKeys(config)` is the only correct way to read the set, because a key set to `false` must not count.

## Absolutization runs before the merge

`absolutizeEntryPaths` resolves each layer's `path` fields against **that layer's own base directory**, before layers are combined. This is what makes partial override correct: a project entry supplying only `vars` inherits the global entry's absolute path, instead of keeping a bare relative path that would later resolve against the wrong root.

It also stamps a display-only `LAYER` symbol, which is what `crunes list` and `crunes doctor` report.

## Decisions folded here

**Validation happens inside `loadConfig`, not at call sites.** No caller can skip it, so a malformed permission block is rejected before anyone sees the config. This removes a whole class of bug where invalid config produces no error and no permitted I/O.

**Synchronous `readFileSync`.** Every caller loads config once at the start of a command before async work begins. Sync keeps call sites simple and puts errors on the stack rather than in an unhandled rejection.

**No caching between calls.** Config files are small and startup I/O is cheap; caching would buy little and cost invalidation. In tests, a config change takes effect on the next call with no process restart.

**Writers never persist a merged config.** `config-writer.js` reads raw file contents, mutates and writes back. Persisting the merged object would write absolutized paths — and entries belonging to other layers — into whichever file was being edited.

## Gotchas

**A missing project config no longer throws.** `loadConfig` returns the global layer alone and marks the result `ROOTLESS`. Code that wrapped it in `try`/`catch` to survive `ENOENT` simply never takes that branch now; the catch still guards genuinely malformed JSON.

**Entry paths coming out of `loadConfig` are absolute.** Anything comparing them to a relative literal, or joining them onto a project root, is wrong. `resolveRuneFilePath` accepts both forms for hand-built configs in tests.

**There is no search upward.** `loadConfig(dir)` reads `join(dir, '.crunes', 'config.json')` and nothing else. Running from a subdirectory needs `--cwd`, or that directory is simply rootless and only global runes resolve. `--ccd` redirects only the project layer; the global layer still applies unless `CRUNES_NO_GLOBAL=1`.

**`CircularRuneError` carries no chain array.** The cycle is formatted into the message (`release → m → release`) and not stored as a property, so a caller needing the raw chain has to parse the string.
