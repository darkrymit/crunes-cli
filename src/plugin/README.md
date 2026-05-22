# plugin

Plugin lifecycle management: discover, install, uninstall, enable, disable, update, and scaffold new plugins. Full docs: `docs/knowledge-base/modules/plugin.md`

## Key Files

- **registry.js** — `loadRegistry()` and `resolvePluginKey(name, registry)` — global plugin index stored at `~/.crunes/plugins.json`.
- **manifest.js** — `loadPluginJson(dir)` and `validatePluginJson(json)` — reads and validates a plugin's `plugin.json`.
- **install.js** — `installPlugin(opts)` — full install flow: fetch source, validate manifest, request consent, run `npm install`.
- **store.js** — `getStorePath()` and path helpers — resolves `~/.crunes/plugins/<key>` for a given plugin.
- **consent.js** — Interactive permission-grant prompt shown during plugin install.
- **deps.js** — Plugin npm dependency resolution and hoisting helpers.

## Sub-directories

- **commands/** — CLI handlers: `install`, `uninstall`, `list`, `update`, `enable`, `disable`, `create`.

## Related Modules

- `marketplace` — `resolveFromMarketplace` is called by `install` and `update` to locate plugin sources from marketplace indexes.
- `rune` — `resolver.js` calls `loadRegistry` / `loadPluginJson` to discover plugin runes; `runner.js` executes them via `executePluginRune`.
