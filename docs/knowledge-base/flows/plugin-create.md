---
tags: [flow]
---
# `crunes plugin create` Flow

> A new plugin scaffold is generated with dual manifests, example rune and template files, and documentation stubs.

**Modules:** [[modules/plugin]], [[modules/shared]]

## Overview

`crunes plugin create [name]` collects plugin metadata (interactively or from flags), resolves an output directory, and writes six scaffold files that form a complete, immediately-installable plugin. The two manifests serve different consumers: `plugin.json` is the runtime manifest read at install/execution time; `marketplace.json` is the publishing entry point for marketplace indexes.

## Walkthrough

```
crunes plugin create [name] [--description] [--author] [--license] [--out <dir>]
          │
          ▼
  Mode detection: yes || !process.stdout.isTTY → non-interactive
          │
          ├─ Non-interactive:
          │     name missing → error + exit 1
          │     description missing → error + exit 1
          │     author = --author flag ?? git config user.name (spawnSync, silent fail)
          │     license = --license flag ?? 'MIT'
          │
          └─ Interactive (TTY):
                → @clack/prompts: text(name), text(description),
                  text(author, initialValue: git config user.name),
                  text(license, initialValue: 'MIT')
                → any cancel signal → "Cancelled." + return
          │
          ▼
  outDir = resolve(projectRoot, --out flag ?? name)
          │
          ▼
  readdir(outDir):
  → throws (dir absent) → proceed
  → empty → proceed
  → non-empty + non-interactive → error + exit 1
  → non-empty + interactive → confirm overwrite; decline → "Cancelled." + return
          │
          ▼
  Generate 6 files (written sequentially, mkdir recursive per file):

  outDir/
  ├─ .crunes-plugin/
  │   ├─ plugin.json          — runtime manifest (format, name, version, runes, templates)
  │   └─ marketplace.json     — publishing manifest (name, plugins[] with source: './')
  ├─ runes/
  │   └─ example.js           — runnable example rune (import @utils, export use(args))
  ├─ templates/
  │   └─ example-template.js  — template scaffold (same structure as example rune)
  ├─ README.md                 — name + description + installation stub
  └─ CHANGELOG.md              — ## 1.0.0 initial release stub
          │
          ▼
  Output: "Created <outDir>\nRun: crunes plugin install ./<name> to test locally"
```

## Generated File Contents

**`.crunes-plugin/plugin.json`**
```json
{
  "format": "1",
  "name": "<name>",
  "version": "1.0.0",
  "description": "...",
  "author": { "name": "..." },
  "license": "MIT",
  "keywords": [],
  "runes": {
    "example": {
      "name": "Example Rune",
      "permissions": { "use": { "allow": [], "deny": [] } }
    }
  },
  "templates": {
    "example-template": { "name": "Example Template" }
  }
}
```

**`.crunes-plugin/marketplace.json`**
```json
{
  "format": "1",
  "name": "<name>",
  "plugins": [{ "name": "<name>", "source": "./" }]
}
```

`source: "./"` makes this repo its own one-plugin marketplace — `crunes marketplace add ./path` will find and serve it. This enables local development without a separate marketplace server.

**`runes/example.js`** — A complete, runnable rune using `import { md, section } from '@utils'`. The commented-out `args()` export and inline comments guide plugin authors toward the correct patterns.

**`templates/example-template.js`** — Structurally identical to the example rune. The distinction is semantic: runes in `runes/` execute directly via `crunes use plugin:key`; templates in `templates/` are copied into the user's project by `crunes template use`.

## Error Paths

- **Missing name (non-interactive)** — exits 1 immediately.
- **Missing description (non-interactive)** — exits 1 immediately.
- **Non-empty output dir (non-interactive)** — exits 1 with hint to use `--out`.
- **Non-empty output dir (interactive)** — prompts; decline exits 0.
- **File write error** — unhandled; propagates to top-level error handler.

## Key Decisions

- **Dual manifests for dual audiences:** `plugin.json` is read by `crunes` at install and execution time. `marketplace.json` is read by `crunes marketplace add` to discover the plugin for publishing. Both live in `.crunes-plugin/` so the plugin repo is self-contained as both a plugin and a one-entry marketplace.

- **`source: "./"` in marketplace.json:** Points back to the repo root. When users add this repo as a marketplace source, `resolvePluginSource` resolves `./` relative to the `.crunes-plugin/` directory's parent — i.e., the repo root — allowing `crunes plugin install <marketplace>@<name>` to work against a local checkout.

- **Git author auto-detection:** `spawnSync('git', ['config', 'user.name'])` pre-fills the author prompt. Fails silently (empty string) if git is unavailable or unconfigured.

- **Output dir defaults to plugin name:** `outDir = resolve(projectRoot, out ?? name)`. A plugin named `my-tool` creates `./my-tool/`. Override with `--out` to place the scaffold elsewhere.

- **No atomic write:** The scaffold writes six independent files sequentially. There is no rollback on partial failure — if a write fails midway, the output dir is left in a partial state. Re-running with `--out` pointing to a clean directory is the recovery path.
