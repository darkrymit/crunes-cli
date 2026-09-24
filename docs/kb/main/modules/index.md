# Modules

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
