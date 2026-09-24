---
type: decision
title: One esbuild bundle, and runes stay on disk
description: The whole of src/ compiles to a single gitignored dist/cli.js, while rune files are read from disk at runtime so editing one needs no rebuild.
tags: [build, esbuild, distribution]
resource: build.mjs
---

# One esbuild bundle, and runes stay on disk

`npm run build` produces a single `dist/cli.js` containing all of `src/`. It is gitignored, never committed, and rebuilt by CI on a tag before publish.

The only dynamic `import()` left at runtime is in the Commander action handlers, which are lazy so that startup does not pay for every command's module graph — see [lazy command handlers](/modules/cli.md).

## Runes are not bundled

Rune files — `.crunes/runes/*.js` and the runes inside plugins — are **read from disk at runtime** and compiled into the isolate. They cannot be bundled: they are user content that did not exist when the CLI was built.

The useful consequence is that **editing a rune requires no rebuild**, and editing `src/` requires one. This catches people out in exactly one direction: a change to CLI behaviour that appears to do nothing is almost always an unbuilt `src/`. See [dist must be rebuilt](/gotchas/dist-rebuild.md).

## Why a single file

Startup time is the constraint. A CLI an agent calls repeatedly in a loop pays its module-resolution cost on every call, and resolving a tree of hundreds of files through Node's resolver is measurably worse than reading one. Bundling also removes any chance of a partially-installed dependency tree producing a half-working CLI.

## What it costs

**Stack traces point into the bundle.** A runtime error names a line in `dist/cli.js` rather than in `src/`, so debugging from a user's report means mapping back by hand.

**`dist/` is a build artifact that looks like source.** It sits in the working tree, it is valid JavaScript, and it is tempting to edit when a fix is needed quickly. Every such edit is destroyed by the next build, silently, and the fix appears to regress for no reason.

**The generated API JSON is a build output too.** `src/docs/generated/*.json` is produced by the same build from the TypeScript declarations, so a new method on a `.d.ts` is undocumented until the next build — a one-cycle lag accepted in exchange for documentation lookups that are a file read rather than a TypeScript compilation.
