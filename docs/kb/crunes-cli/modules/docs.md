---
type: module
title: docs
description: The documentation engine — renders the API reference from TypeScript declarations and rune help from live schemas, so what an agent reads describes the installed version rather than a copy.
tags: [module, documentation, typedoc]
resource: src/docs/
---

# docs

Documentation is **compiled, not stored**. Nothing in this module serves prose someone wrote about the API; every page is rendered from a source that changes when the code changes.

That property is why an agent holding only the CLI still gets an accurate reference, and why [the skills state no API surface](kb:crunes-main/decisions/skills-state-no-api.md).

**Submodules:** `ts-walker.js` (normalises the TypeDoc AST), `ts-formatter.js` (renders it), `intro-compiler.js` (assembles the handbook), `help-render.js` (the shared renderer for rune help and `docs rune`), `commands/`.

## Two sources, two behaviours

**`docs utils` and `docs globals` read a build artifact.** `src/docs/generated/*.json` is produced by TypeDoc during `npm run build` from the `.d.ts` files in `src/rune/api/types-*`. Lookup is then a file read rather than a TypeScript compilation.

The cost is a **one-build lag**: a method added to a `.d.ts` is undocumented until the next build. Accepted deliberately — running TypeDoc on demand would make every documentation lookup slow, and the lookups are frequent.

**`docs rune` boots a real isolate.** To show a rune's arguments it creates a throwaway sandbox, evaluates the whole module, and calls the `args()` export. The schema shown is therefore exactly the schema the rune would use, including one built dynamically — which static AST parsing could not guarantee.

## Progressive disclosure

Rune help and `docs rune` share one renderer and disclose in levels, so a rune with a deep command tree does not produce a page that floods an agent's context:

* `crunes docs rune` — every resolvable rune with its command tree.
* `crunes docs rune <key>` — that rune's command index.
* `crunes docs rune <key> <command>...` — one bounded page for that command: its own options, positionals, examples, and direct children only.

`--format json` mirrors the text scope at every level. In-rune `rune.helpText()` / `rune.helpSection()` use the same renderer, which is what keeps a rune's own `--help` consistent with the CLI's view of it.

A rune whose schema fails to build is reported inline in the index and does not prevent the healthy runes from listing.

## Gotchas

**`docs rune` runs the entire module, not just `args()`.** Module-body side effects execute and permission checks apply during documentation generation. A rune that opens a connection or writes a file at import time does so every time someone asks what its arguments are. Side-effectful code belongs inside `run()`.

**Unknown inputs exit 1 after processing the valid ones.** `crunes docs utils http nosuch` prints `http`, warns about `nosuch`, then exits non-zero. Batch generation still gets partial output, but a caller who needs to detect failure must check the status rather than the output.

**`docs run` documents the export, not the command.** `crunes docs run` is about the `run(args)` function a rune author writes — `$command`, `$commands`, `_`, `$raw`. It is not documentation for the `crunes run` CLI command. The same applies to `docs repl`. The naming follows the export, and confusing the two is the most common mistake made with this module.

**A multi-paragraph description belongs in the document, not the index.** The namespace index prints one line per namespace and takes only the first paragraph; a description written as several paragraphs used to break the list apart mid-way. The full text still renders on the namespace's own page.
