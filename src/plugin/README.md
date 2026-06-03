# plugin

Plugin lifecycle management: discover, install, uninstall, enable, disable, update, and scaffold new plugins. Full docs: `docs/knowledge-base/modules/plugin.md`

## Files

- **registry.js** — `loadRegistry()` — loads the global plugin index from `~/.crunes/plugins.json`. `saveRegistry(data)` — persists registry atomically. `registerPlugin(entry)` — adds a plugin entry. `removePlugin(key)` — removes a plugin entry. `resolvePluginKey(nameOrKey, registry)` — resolves a bare name or fully-qualified key; throws if ambiguous.
- **manifest.js** — `loadPluginJson(dir)` — loads and validates `plugin.json` from a plugin directory. `validatePluginJson(json)` — validates plugin.json structure.
- **install.js** — `installPlugin(source, projectDir, provenance?, options?)` — full install flow: fetch source, validate manifest, request consent, run dependency install. `uninstallPlugin(pluginKey, projectDir)` — removes plugin and cleans up cache and config.
- **consent.js** — `formatConsentScreen(pluginName, pluginJson)` — formats the permission request display. `promptConsent(pluginName, pluginJson, opts)` — interactive consent prompt for initial install. `diffPermissions(oldConsented, newPluginJson)` — calculates new permissions added in an update. `promptReConsent(pluginName, diff, opts)` — interactive prompt for new permissions on update.
- **deps.js** — `detectPackageManager()` — detects available package manager (`pnpm`, `bun`, or `npm`). `installDeps(pluginCacheDir, dependencies)` — installs plugin dependencies using the detected PM.
- **commands/install.js** — `handler({ source, projectRoot, yes })` — installs a plugin by `marketplace@plugin` reference.
- **commands/uninstall.js** — `handler({ name, yes, projectRoot })` — uninstalls a plugin with optional confirmation.
- **commands/enable.js** — `handler({ name, projectRoot })` — enables an installed plugin in project config.
- **commands/disable.js** — `handler({ name, projectRoot })` — disables an installed plugin in project config.
- **commands/list.js** — `handler({ format })` — lists installed plugins in md or json format.
- **commands/update.js** — `handler({ name, projectRoot })` — updates a specific plugin or all installed plugins.
- **commands/create.js** — `handler({ name, description, author, license, out, yes, projectRoot })` — scaffolds a new plugin project with `plugin.json`, `marketplace.json`, example rune, template, README, and CHANGELOG.

## Related Modules

- `marketplace` — `resolveFromMarketplace` is called by `install` and `update` to locate plugin source URLs.
- `rune` — `resolver.js` calls `loadRegistry` / `loadPluginJson` to discover plugin runes; `runner.js` executes them via `executePluginRune`.
- `store` — `getPluginsJsonPath`, `getPluginCacheDir`, `getPnpmStorePath`, `ensureStoreDirs` resolve plugin storage paths.
