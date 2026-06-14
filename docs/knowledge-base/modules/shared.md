---
tags: [module]
---
# shared

> Cross-cutting utilities: `render.js` converts Section data to CLI strings; `output.js` is the global logger with plain/color modes; `match.js` exports two matchers — `isGlobMatch` (path-aware, micromatch) and `isWildcardMatch` (flat string, regex).

**Source:** `src/shared/`
**Related:** all modules (no domain coupling)

## Overview

The shared module provides three utilities with no domain knowledge. It does not understand runes, plugins, or projects — it knows only about rendering, logging, and glob matching. A module imports from shared to produce output and log messages. Because shared has no domain knowledge, no other module needs to avoid importing it, preventing circular dependencies.

The renderer converts structured data (trees, markdown) into CLI-displayable strings. The logger provides a global output sink that respects plain/color mode configuration. Both are invoked by the CLI framework for every rune execution.

## Concepts

**Section rendering format:** When a rune returns data, it wraps it in a Section — a container with a title, optional attributes, and the data itself. The renderer produces a specific format: a markdown heading, an optional attribute line, and the data wrapped in markdown fences. The fence wrapper is intentional — it signals to readers and AI tools that the content is markdown source, not prose.

**Global configuration affects all chalk calls:** The plain/color mode is set once at startup and affects every colored output in the entire process. This is implemented by setting the chalk singleton's level globally. Any module that uses chalk automatically respects the setting without needing to know about it. The alternative — threading a configuration object through every logging call — would be more explicit but much more cumbersome.

**Tree rendering with column alignment:** Trees are rendered with box-drawing characters (├──, └──, │) to show hierarchy. Node names are padded to a fixed width so that descriptions align vertically. Names longer than the fixed width push the description column out of alignment — this is cosmetic but affects output readability.

**Sections with no content are dropped:** If a section has no title and no renderable data, it produces an empty string. The run handler filters out empty sections from the output. A rune can return a section with no title and no data, and it silently disappears. This is sometimes intentional (conditional output) and sometimes a bug (missing data field).

**Two matchers for two semantics:** `match.js` exports `isGlobMatch` and `isWildcardMatch` for different matching contexts. `isGlobMatch` wraps micromatch with a fixed option set (`dot`, `noextglob`, `nonegate`, `nobrace`, `nobracket`) — `*` stops at `/`, so it is correct for file paths and URLs where path boundaries are meaningful security boundaries. `isWildcardMatch` converts patterns to a regex where `*` (and `**`) match any characters including `/`, spaces, and commas — correct for shell commands, rune keys, env var names, cache/sqlite names, and db URIs, where there are no path-segment boundaries. Both are imported by name; the correct choice is determined by whether the value being matched has path-segment semantics.

**`formatSection` for CLI output:** `render.js` also exports `formatSection`, which produces a CLI-prefixed string (`[instanceId:rune:section] name`) for REPL and streaming output modes. It is distinct from `renderSection`, which produces the plain section body used in batch post-run flush.

## Key Decisions

**Markdown fences are always present:** Even in plain mode (no colors), the triple-backtick markdown fences are included. The fences are not a formatting decoration — they are semantic content that tells downstream consumers the material is markdown source. Removing them would lose information. So the fences stay in plain mode.

**Global chalk configuration instead of per-call parameters:** Setting chalk level globally is simpler than threading a configuration object through every logging call site. The trade-off is that new code automatically respects the mode without any additional work. This is a worthwhile trade-off for simplicity.

**Mutable export binding for verbosity flag:** The verbosity setting is exported as a mutable binding, not a getter function. Code that captures it at import time gets the initial value (false) before configuration runs. This is a real source of bugs — code must re-read the binding at runtime, not cache it at import. Using a mutable binding makes the issue visible (the variable is reassigned, so static analysis can detect captured-at-import-time bindings).

## Gotchas & Debugging

**Unknown data types render silently:** If a section's data type is neither `tree` nor `markdown`, the renderer returns null. The section then produces only a header with no body. Debugging this requires checking the data type — the section rendering function gives no warning.

**Empty sections disappear from output:** A section with no title, no name, and no renderable data produces an empty string. The run handler filters these out. If a rune returns such a section intentionally (to suppress output conditionally), that is fine. If it is unintentional, the output simply vanishes — there is no error or warning.

**Verbosity flag must be read at runtime:** Modules that import the verbosity flag and capture it in a local constant at the top of the file will see the initial value (false) forever, even after configuration runs. The flag must be re-read at each use, not cached. This is not enforced by the language — developers must remember to do it.

**Tree column alignment breaks with long names:** The tree renderer pads node names to a fixed width. Names longer than that width push the description column rightward, breaking alignment. This is cosmetic but affects the readability of module structure output. There is no overflow handling — the alignment assumption is that node names fit.

**Plain mode does not strip markdown fences:** The markdown fences in section output are preserved in plain mode. The chalk calls are suppressed (no colors), but the fences stay. This is intentional — the fences carry semantic meaning about the content type. If they were removed in plain mode, piped or captured output would lose information.
