---
type: module
title: marketplace
description: Marketplace source registration and index caching — four source types classified from the string each time, remote indexes cached until explicitly updated, and identity taken from the index rather than the URL.
tags: [module, marketplace, plugin]
resource: src/marketplace/
---

# marketplace

Registers sources and caches the plugin indexes they publish, so that installing a plugin reaches no network. The model is [a shared concept](kb:crunes-main/concepts/marketplace.md); this covers the implementation.

**Submodules:** `commands/` — `add`, `remove`, `list`, `search`, `update`, `browse`.

## Classification is derived, never stored

The source string is parsed on every operation to decide its type: a `github:` prefix or `owner/repo` shape, an `http(s)://` URL, an `npm:` prefix or bare package name, or a path beginning with `.`, `/`, `~` or a drive letter. Nothing records the type, so there is no stored classification that can disagree with the string it came from.

## Cached versus live

GitHub and npm sources cost a network round trip and are rate-limited, so their index is cached at `add` and **never refreshed except by an explicit `update`.** HTTP and local sources are read live every time.

Caching is what makes installs reproducible: the same registered index yields the same plugin for everyone, and CI does not depend on what an upstream repository looks like this morning.

## Identity from the index

The registry key is the `name` field inside the downloaded index, not the source URL. A marketplace that renames itself is detected at `update` and re-keyed — a new entry appears, and the old entry and its cache directory are deleted.

## Decisions folded here

**Registry writes are atomic.** Updates write a temp file and rename it over the target, so an interrupted write leaves the original intact rather than a truncated registry.

**Resolution never fuzzy-matches.** A plugin is resolved by the exact marketplace name the caller gave. Guessing would make installs non-reproducible across a team for the sake of saving a few characters.

## Gotchas

**A remote marketplace that gained plugins does not offer them until `update`.** The failure reads as *no such plugin*, which points at the plugin rather than at the stale cache.

**A local source is never copied.** Moving or deleting the directory breaks the entry silently — nothing validated it at `add`, so the error appears at install.

**A rename breaks every external reference.** The registry re-keys itself, but scripts, config and documentation naming the old marketplace fail with *marketplace not found*, and nothing rewrites them.

**Relative paths resolve against the index's parent for `.crunes-plugin/` layouts.** For a repository serving its own marketplace, the base is the directory *containing* `.crunes-plugin/`, so `./plugins/git` in the index means the repository root rather than the manifest folder. This is what makes the self-serving layout work, and it is surprising until you know it.
