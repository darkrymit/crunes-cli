---
type: gotcha
title: src changes need a rebuild, rune changes do not
description: Editing src/ has no effect until npm run build, while rune files are read from disk at runtime — so a CLI change that appears to do nothing is almost always an unbuilt bundle.
tags: [build, debugging]
resource: build.mjs
---

# `src` changes need a rebuild, rune changes do not

The CLI runs from `dist/cli.js`. Editing `src/` and re-running `crunes` executes the **previous** build, with no warning that the two differ.

Rune files are the opposite: `.crunes/runes/*.js` and plugin runes are read from disk and compiled into the isolate on every invocation, so an edit takes effect immediately.

The asymmetry is what makes this confusing. A session that alternates between editing a rune and editing the CLI gets instant feedback from one and stale behaviour from the other, which reads as *the change did not work* rather than as *the change was not built*.

**Check first:** if a `src/` change appears to have no effect, run `npm run build` before debugging anything else.

## Never edit `dist/`

`dist/cli.js` is a valid, readable JavaScript file sitting in the working tree, and patching it directly does work — until the next build overwrites it. The fix then appears to regress for no reason, and the real edit is gone. It is gitignored precisely because it is an output.

## The generated API JSON has the same lag

`src/docs/generated/*.json` is produced by the build from the `.d.ts` files. A capability whose types were just added is absent from `crunes docs utils` until the next build. See [the docs module](/modules/docs.md).
