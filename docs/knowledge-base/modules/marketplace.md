---
tags: [module]
---
# marketplace

> Marketplace source URL management and plugin index caching — add/remove sources, search plugins across sources, and resolve plugin source URLs for install.

**Source:** `src/marketplace/`
**Submodules:** `commands/` (add, remove, list, search, update, browse)
**Related:** [[modules/plugin]]

## Overview

A marketplace is a curated source of available plugins. Each marketplace publishes an index file listing the plugins it offers. The index is cached locally so that plugin install operations do not require network calls. The cache is never refreshed automatically — developers explicitly run an update command to pull the latest index from the marketplace source.

Marketplaces are classified into four types: github repositories, direct HTTPS URLs, npm packages, or local filesystem paths. Each type has its own fetch and caching behavior. Remote sources (github, npm) are cached; local and HTTP sources are fetched fresh every time.

## Concepts

**Source type classification:** The source string is parsed to determine its type. A github prefix or owner/repo format indicates a github source. HTTP/HTTPS URLs are http sources. NPM prefixes or package names are npm sources. Paths starting with dot, slash, tilde, or Windows drive letters are local. The classification is deterministic and happens at every operation — there is no stored type metadata.

**Cached vs. live fetching:** GitHub and npm sources are expensive to fetch (network round-trips, rate limits), so they are cached at the first add operation. The cache is never refreshed unless the update command is explicitly run. HTTP and local sources are fetched live — there is no cache layer. This means HTTP sources require network access every time they are resolved, and local sources are always up-to-date but cannot be moved without breaking the reference.

**Identity from marketplace name, not source URL:** The registry key for each marketplace comes from the `name` field in the downloaded index, not from the source URL. If a marketplace changes its name, the update command detects the mismatch and re-keys the entry in the registry. This means the same marketplace source can be known by different names if it renames itself, and the registry will track all the names it has ever claimed.

**Resolved paths for relative references:** When a marketplace index contains relative plugin paths (like `./plugins/my-plugin`), those paths must be resolved to absolute paths or absolute URLs. For cached sources, the resolution base is the cache directory. For local sources, it is the directory containing the marketplace index. This resolution happens in the plugin module when resolving from a marketplace, not in the marketplace module itself.

## Flows

- [[flows/plugin-install]] — marketplace resolution is step 1 of the install flow; marketplace API is consumed by the plugin install and update flows.

## Key Decisions

**No automatic refresh of remote caches:** Remote marketplaces must be explicitly updated. This prevents unexpected network calls during plugin install operations and makes installs reproducible — the same index is used until the developer explicitly updates it. The alternative — always fetching the latest index — would add network latency and require handling of rate limits.

**Atomic writes via temp file rename:** Registry updates write to a temporary file then rename it over the production file. If the process is interrupted mid-write, the original file is unaffected. This prevents corrupted registries from failed updates.

**Marketplace name from registry key lookup:** When resolving a plugin, the API takes the marketplace name directly from the user's configuration. It does not fuzzy-match or search — the caller must provide the exact name. This is intentional because plugin installations should be reproducible across team members, and fuzzy matching would break that guarantee.

## Gotchas & Debugging

**GitHub and npm sources require update before install:** Adding a github or npm marketplace downloads and caches the index. But future updates to that marketplace are not pulled automatically. If the upstream marketplace adds new plugins after the initial add, the local cache does not know about them. Developers must run an explicit update command to get the latest plugins.

**Local marketplace sources are not copied or cached:** A local filesystem path is read live every time the marketplace is resolved. If the source directory is moved or deleted, the marketplace entry breaks silently — there is no error when adding the marketplace, only when installing from it.

**Marketplace rename breaks existing references:** If a marketplace changes its name field, the update command detects this and creates a new registry entry under the new name. The old registry entry and old cache directory are deleted. Code that references the old name (in scripts, configuration, or documentation) will fail silently with "marketplace not found."

**Relative path resolution assumes parent directory structure:** For local marketplaces inside a `.crunes-plugin/` directory (a plugin repo serving as its own marketplace), the resolution base is set to the parent of `.crunes-plugin/`. This means a relative path like `./` in the marketplace index points to the repo root, not to the config directory. This behavior is intentional — it allows a plugin to serve its own marketplace — but it is surprising if you do not know about it.

**Local sources are always current, no cache:** Local marketplace sources are fetched live on every resolution. This means changes to the local marketplace index are immediately visible. But it also means moving or deleting the source directory breaks the entry silently. There is no warning and no way to repair the reference short of re-adding the marketplace with the correct path.
