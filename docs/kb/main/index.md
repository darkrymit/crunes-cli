---
okf_version: 0.2
kb_version: 0.1
kb: crunes-cli-main
---

# crunes-cli knowledge base

The runtime: how a rune key becomes an isolate, what each module under `src/` owns, and the traps found while building it.

What is true of the ecosystem rather than of this code — the model, the vocabulary, the contracts more than one repository implements — is in [`crunes-main`](kb:crunes-main/index.md). A note here earns its place by being unguessable from the source: if the code says it plainly, the code is the record.

**The API surface is not documented here.** `crunes docs utils`, `crunes docs rune`, `crunes docs globals` and `crunes docs intro` render it from the TypeScript declarations and from live rune schemas, so they describe the installed version. A copy in this bundle would describe whichever version it was written against.

## Patterns

* [Feature-first module layout](/patterns/feature-first-layout.md) - Code under src/ is organised by feature domain rather than by infrastructure layer, so each feature owns its commands and internals and no shared infrastructure tier can form.
* [The isolate boundary](/patterns/sandbox-isolation.md) - Every rune runs in a fresh V8 isolate with no Node built-ins, so each capability must be implemented on the host, injected as a reference, and exposed in the bootstrap — and missing any of the three fails silently.
* [Storage layers and the store path](/patterns/storage-layers.md) - Persistent state splits between a machine-wide store and per-project config, every path is computed by one module honouring CRUNES_STORE, and a directory that is not a project redirects its local state into the store.

## Modules

* [cache](/modules/cache.md) - Named key/value buckets where every entry is its own JSON file, so concurrent runes never contend, with passive expiry that only a clear operation acts on.
* [cli](/modules/cli.md) - The process entry point — two mutations to the runtime before Commander sees anything, lazy-loaded action handlers, and the global flags that configure output once for the whole process.
* [core](/modules/core.md) - Three-layer config loading, the merge rules that decide what each layer may override, path absolutization per layer, and the circular-call error — deliberately holding no domain logic of its own.
* [docs](/modules/docs.md) - The documentation engine — renders the API reference from TypeScript declarations and rune help from live schemas, so what an agent reads describes the installed version rather than a copy.
* [job](/modules/job.md) - Background process tracking as one file per job with no central index, lazily garbage-collected at read time, plus the poll-based stdin log that lets a REPL job survive a parent restart.
* [marketplace](/modules/marketplace.md) - Marketplace source registration and index caching — four source types classified from the string each time, remote indexes cached until explicitly updated, and identity taken from the index rather than the URL.
* [plugin](/modules/plugin.md) - Plugin lifecycle against two storage layers — a machine-wide registry recording what is installed and consented to, and a per-project map recording what is enabled here.
* [project](/modules/project.md) - A stable per-project identity that survives renames and moves, plus a global reverse index from identity to directory so cross-project operations need no filesystem scan.
* [rune](/modules/rune.md) - Key resolution, isolate execution, the utils API and permission enforcement — everything between a rune key on the command line and the sections it returns.
* [shared](/modules/shared.md) - The three cross-cutting utilities with no domain knowledge — section rendering, the global output sink, and the two matchers whose difference is which values have path-segment boundaries.
* [sqlite](/modules/sqlite.md) - Named SQLite databases registered in a central index, sharing the cache module's scope and key-hashing rules, with WAL sidecars that deletion must account for.
* [store](/modules/store.md) - The single place every store path is computed, honouring CRUNES_STORE at call time and deciding through getLocalBase whether local state lands beside the project or inside the store.
* [template](/modules/template.md) - Rune scaffolds resolved through a priority chain of project config, shortcut entries and plugins — where creating registers a template and applying turns one into a runnable rune.

## Flows

* [crunes plugin create](/flows/plugin-create.md) - Scaffolds a plugin with two manifests, so the generated repository is simultaneously a plugin and the single-plugin marketplace that serves it.
* [crunes plugin install](/flows/plugin-install.md) - Resolve from a marketplace, stage, validate the manifest, take consent, then write both registries — with provenance required at the front and staging cleanup guaranteed at the back.
* [crunes repl](/flows/repl.md) - A session in one isolate — repl() initialises once, inputRepl() handles each event, and the host owns readline, slash commands, completion and multiline while the rune sees only cooked input events.
* [crunes run](/flows/run.md) - From argv to sections — prefix-only flag parsing, optional batch splitting, tiered key resolution, isolate setup and the two waves in which output reaches stdout.
* [crunes template apply](/flows/template-apply.md) - Resolve a template through project config then plugins, copy the file, and write a runnable rune entry carrying the template's declared permissions — with shortcut entries letting a project rename a plugin's template.

## Decisions

* [Re-spawn for --no-node-snapshot](/decisions/node-snapshot-respawn.md) - The entry point re-spawns itself with --no-node-snapshot before any module loads, because isolated-vm cannot run under V8's startup snapshot and the flag has to be set before the library is imported.
* [One esbuild bundle, and runes stay on disk](/decisions/single-bundle-build.md) - The whole of src/ compiles to a single gitignored dist/cli.js, while rune files are read from disk at runtime so editing one needs no rebuild.

## Gotchas

* [src changes need a rebuild, rune changes do not](/gotchas/dist-rebuild.md) - Editing src/ has no effect until npm run build, while rune files are read from disk at runtime — so a CLI change that appears to do nothing is almost always an unbuilt bundle.
* [Every invocation shows as two processes](/gotchas/double-process.md) - The parent re-spawns itself with --no-node-snapshot and exits, so crunes always appears twice in a process monitor and all real output comes from the child.
* [A bare temp directory is rootless](/gotchas/rootless-temp-dirs.md) - A directory with no .crunes/config.json is not a project, so local state redirects into the store — which catches tests that create a temp directory and expect state beside it.
* [Watching a Windows short path aborts the process](/gotchas/windows-short-paths.md) - libuv compares an event filename against the directory string it was given and fails a native assertion when they disagree, so watching an 8.3 short path kills the process outright rather than throwing.
