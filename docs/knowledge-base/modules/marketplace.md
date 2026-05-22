---
tags: [module]
---
# marketplace

> Marketplace source URL management and plugin index caching — add/remove sources, search plugins across sources, and resolve plugin source URLs for install.

**Source:** `src/marketplace/`
**Submodules:** `commands/` (add, remove, list, search, update, browse)
**Related:** [[modules/plugin]]

## Overview

A marketplace is a named source that publishes a `marketplace.json` index of available plugins. Sources are classified into four types: `github` (owner/repo), `http` (direct HTTPS URL), `npm` (package name), or `local` (file path). The marketplace list is persisted in `~/.crunes/marketplaces.json`.

`resolveFromMarketplace(marketplaceName, pluginName)` is the only external API consumed by the plugin module — it returns the resolved source URL that `plugin install` and `plugin update` use to locate a plugin.

## Concepts

**Source type classification (`classifyMarketplaceSource`):** The source string is classified at every operation. `github:` prefix or bare `owner/repo` → github. `http://` or `https://` → http. `npm:` prefix or bare npm name → npm. Path starting with `.`, `/`, `~`, or matching `[A-Za-z]:[/\\]` → local.

**Live vs. cached fetching:** HTTP and local sources are always fetched live from the source URL/path — no cache layer. GitHub and npm sources are served from the cache at `~/.crunes/marketplaces/<name>/marketplace.json`. The cache is never refreshed automatically — `crunes marketplace update <name>` must be run explicitly.

**Marketplace identity from `name` field:** The registry key in `~/.crunes/marketplaces.json` is the `name` field from the downloaded `marketplace.json`, not the URL. `addMarketplace` reads the name from the index and uses it as the key. If a marketplace renames itself (changes its `name` field), `updateMarketplace` detects the mismatch and updates the registry key.

**`resolvedPath` for relative source resolution:** `fetchMarketplace` returns `{ data, resolvedPath }`. For github/npm cache, `resolvedPath` is the cache directory. For local, it is the directory containing `marketplace.json` (with `.crunes-plugin/` stripped — see gotchas). `resolvePluginSource` uses `resolvedPath` to resolve relative plugin source paths (`./plugins/my-plugin`) to absolute paths or absolute URLs.

## Flows

- [[flows/plugin-install]] — marketplace resolution is step 1 of the install flow; `resolveFromMarketplace` is the external API consumed by `plugin install` and `plugin update`

## Key Decisions

- **No automatic refresh for remote sources:** Remote marketplace indexes (github, npm) require an explicit `crunes marketplace update` to pull the latest index. This prevents unexpected network calls during plugin install and keeps installs reproducible — the installed version comes from the cached index, not whatever is latest upstream.

- **Atomic writes via temp file rename:** `saveMarketplaces` writes to `marketplaces.json.tmp` then renames it over `marketplaces.json`. This prevents a partially written file from corrupting the marketplace list if the process is interrupted mid-write.

- **`resolveFromMarketplace` requires an exact marketplace name:** It looks up `data.marketplaces[marketplaceName]` directly — no fuzzy matching or search across all sources. The caller (plugin install) must pass the exact marketplace name from the user's install token.

## Gotchas & Debugging

- **GitHub and npm sources need `marketplace update` before first `plugin install`:** `addMarketplace` downloads and caches the index on first add for github/npm sources. After that, the cache is never refreshed unless `crunes marketplace update` is run. If the upstream marketplace has added a new plugin, the local cache won't know about it.

- **Local marketplace sources are NOT copied to the cache:** A local path source reads `marketplace.json` live from the path on every `fetchMarketplace` call. Moving or deleting the source directory breaks the marketplace entry without any error at `marketplace add` time.

- **`readLocalMarketplace` strips `.crunes-plugin/` from the resolution base:** If the `marketplace.json` lives inside a `.crunes-plugin/` directory (i.e., a plugin repo serving as its own marketplace), the `resolvedPath` is set to the parent of `.crunes-plugin/`. This means relative plugin sources like `./` in such a `marketplace.json` resolve to the repo root, not to `.crunes-plugin/`.

- **Marketplace rename requires manual cleanup of old cache:** When `updateMarketplace` detects a name change, it deletes the old cache directory and creates a new registry entry under the new name. If the old name was referenced elsewhere (scripts, project configs), those references break silently.
