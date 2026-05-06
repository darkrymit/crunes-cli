---
tags: [module]
---
# plugin

> Plugin lifecycle management: discover, install, uninstall, enable, disable, update, and scaffold new plugins.

**Source:** `src/plugin/`
**Related:** [[modules/marketplace]], [[modules/rune]]

## Overview

The plugin system has two storage layers: a **global registry** (`~/.crunes/plugins.json`) tracking every installed plugin across all projects, and a **project config** (`.crunes/config.json → plugins[]`) listing which plugins are enabled for a specific project. Installing adds to both; uninstalling removes from both.

Plugin sources can be: local path, `github:owner/repo`, `https://...` git URL, or npm package name. All non-local sources are downloaded to a temp dir, validated, then copied to `~/.crunes/plugins/<marketplace>/<name>@<version>/`.

## Key Decisions

- **Consent snapshotting at install time:** The set of permissions a user approves is frozen as `consentedPermissions` in the registry entry. On update, `diffPermissions` computes only the delta (new or escalated permissions). The user is re-prompted only for the delta — not the full list again. This prevents prompt fatigue for minor updates while maintaining security for new capabilities.

- **`marketplace@plugin` as the registry key:** The key format `<marketplace>@<name>` (e.g. `crunes-hub@my-plugin`) allows the same plugin name to coexist from different marketplaces. Bare name resolution (`resolvePluginKey`) errors on ambiguity.

- **Local installs use the source dir directly:** For `crunes plugin install ./path`, the plugin cache dir IS the source dir — no copy is made. Changes to source files take effect immediately without reinstall. Remote installs are always copied.

## Gotchas & Debugging

- **`plugin.json` lives at `.crunes-plugin/plugin.json`, not the repo root:** The manifest validator looks for it at that specific subpath. A `plugin.json` at the root will not be found.

- **`@plugin/**` auto-grant in permissions:** Plugin runes always get `fs.read:@plugin/**` injected automatically. This resolves to the plugin cache dir, not the project dir. Plugin runes that try to read project files must explicitly declare `fs.read:./**` in their permissions.

- **`consentedPermissions` per-rune, not per-plugin:** The consent map is keyed by rune name inside the plugin. Adding a new rune to a plugin's `plugin.json` counts as a new permission grant and triggers re-consent even if no existing rune changed.
