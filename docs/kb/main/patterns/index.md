# Patterns

* [Feature-first module layout](/patterns/feature-first-layout.md) - Code under src/ is organised by feature domain rather than by infrastructure layer, so each feature owns its commands and internals and no shared infrastructure tier can form.
* [The isolate boundary](/patterns/sandbox-isolation.md) - Every rune runs in a fresh V8 isolate with no Node built-ins, so each capability must be implemented on the host, injected as a reference, and exposed in the bootstrap — and missing any of the three fails silently.
* [Storage layers and the store path](/patterns/storage-layers.md) - Persistent state splits between a machine-wide store and per-project config, every path is computed by one module honouring CRUNES_STORE, and a directory that is not a project redirects its local state into the store.
