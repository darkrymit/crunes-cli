---
type: module
title: shared
description: The three cross-cutting utilities with no domain knowledge — section rendering, the global output sink, and the two matchers whose difference is which values have path-segment boundaries.
tags: [module, rendering, output, matching]
resource: src/shared/
---

# shared

Rendering, output and matching. It knows nothing about runes, plugins or projects, and that is precisely what lets everything import it without a cycle forming — see [the feature-first layout](/patterns/feature-first-layout.md).

The test for anything proposed for this module: describe it without naming a domain concept. If you cannot, it belongs in a feature.

## Two matchers, and the difference is not stylistic

`match.js` exports both, and choosing wrongly fails silently in one direction.

**`isGlobMatch`** wraps micromatch with a fixed option set (`dot`, `noextglob`, `nonegate`, `nobrace`, `nobracket`). `*` stops at `/`. Correct for `fs.*`, `http.*` and `ws.*`, where a segment boundary is a real security boundary — `fs.read:./src/*` must not reach `./src/secrets/key.pem`.

**`isWildcardMatch`** converts the pattern to a regex where `*` matches anything, including `/`, spaces and commas. Correct for shell commands, rune keys, env var names, cache and sqlite names, and db URIs — none of which have segment structure.

The failure mode worth remembering: using the path matcher on a shell command means `shell.run:bash *` silently refuses `bash ./run.sh --profile=dev,staging`, because the `/` and the comma stop the wildcard. The grant looks right and the command is denied.

## Rendering

`renderSection` produces the section body used in the batch flush after a run. `formatSection` produces the CLI-prefixed form (`[instanceId:rune:section] name`) used by REPL and streaming output. They are distinct, and picking the wrong one produces output that looks almost right.

Trees are drawn with box characters and names padded to a fixed width so descriptions align. A name longer than the width pushes its column out — cosmetic, with no overflow handling.

## Decisions folded here

**Markdown fences survive plain mode.** `--plain` suppresses colour, not fences. The fences are semantic: they tell a consumer the content is markdown *source*. Stripping them in plain mode would lose that exactly where it matters, since plain mode is what a pipe and an agent receive.

**Colour is configured globally, not threaded.** The chalk level is set once at startup, so every module respects it without knowing it exists. Passing a config object through every call site would be more explicit and far more cumbersome.

**The verbosity flag is a mutable export binding.** A getter would be safer; a mutable binding was chosen because reassignment is visible to static analysis, making captured-at-import-time reads detectable. That choice creates the gotcha below.

## Gotchas

**The verbosity flag must be read at use, never cached at import.** A module doing `const v = verbose` at the top of the file captures `false` before `configureOutput` ever runs, and stays false forever. Nothing in the language prevents this.

**An unknown section type renders as nothing.** A type that is neither `tree` nor `markdown` returns null from the renderer, so the section emits a header and no body, with no warning.

**An empty section disappears entirely.** No title, no name, no renderable data renders to an empty string and is filtered out of the output. Intentional for conditional output; indistinguishable from a misnamed data field.
