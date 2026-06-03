# marketplace

Plugin marketplace source management: register, remove, list, and search marketplace source URLs; browse and refresh cached plugin indexes. Full docs: `docs/knowledge-base/modules/marketplace.md`

## Files

- **marketplace.js** — `loadMarketplaces()` — loads configured marketplace sources from disk. `addMarketplace(source)` — registers a new marketplace source (GitHub, npm, HTTP, local). `removeMarketplace(name)` — removes a marketplace. `updateMarketplace(name)` — refreshes a marketplace's cached index. `listMarketplaces()` — lists all configured marketplaces. `searchMarketplaces(query)` — searches plugins across all marketplaces. `resolveFromMarketplace(marketplaceName, pluginName)` — resolves a plugin to an installable source with version and metadata.
- **commands/add.js** — `handler({ url })` — registers a new marketplace source.
- **commands/remove.js** — `handler({ url })` — removes a marketplace source.
- **commands/list.js** — `handler()` — displays all configured marketplace sources.
- **commands/search.js** — `handler({ query })` — searches and displays plugins matching a query.
- **commands/browse.js** — `handler({ format })` — browses all plugins from all marketplaces in md or json format.
- **commands/update.js** — `handler({ url })` — refreshes a specific marketplace or all configured marketplaces.

## Related Modules

- `plugin` — `plugin install` and `plugin update` call `resolveFromMarketplace` to locate plugin source URLs.
- `store` — `getMarketplacesJsonPath`, `getMarketplaceCacheDir`, `ensureStoreDirs` resolve marketplace storage paths.
