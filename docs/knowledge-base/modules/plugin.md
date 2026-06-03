---
tags: [module]
---
# plugin

> Plugin lifecycle management: discover, install, uninstall, enable, disable, update, and scaffold new plugins.

**Source:** `src/plugin/`
**Related:** [[modules/marketplace]], [[modules/rune]]

## Overview

The plugin system maintains two storage layers that serve different purposes. The global registry (`~/.crunes/plugins.json`) is the machine-wide record of every installed plugin — it tracks where each plugin's files live, what version is installed, and what permissions the user consented to. The project config (`config.json → plugins[]`) records which of those globally-installed plugins are enabled for a specific project. Installing a plugin writes to both; uninstalling removes from both. This separation means a plugin installed once on the machine can be independently enabled or disabled per project, and a project can override or restrict its permissions without affecting any other project that uses the same plugin.

Registry keys follow the format `marketplace@name` (e.g. `crunes-hub@my-plugin`). This composite key allows two plugins with the same name from different marketplaces to coexist without shadowing. When a bare name is used — without the marketplace prefix — the resolver checks for ambiguity and throws rather than silently picking one. This is a deliberate design choice: silent shadowing would make it impossible to audit which plugin is actually running.

Consent is snapshotted at install time. Every permission pattern the user approves is stored in the registry as `consentedPermissions`. On update, a diff against the old snapshot finds only new or escalated patterns — those are the only ones shown to the user. Already-approved patterns are never re-prompted. This prevents consent fatigue for minor updates while maintaining visibility into capability changes.

## Flows

- [[flows/plugin-install]] — full install + update path: marketplace resolution, download, consent, registry write
- [[flows/plugin-create]] — scaffold generation: dual manifests, example rune/template, self-serving marketplace entry

## Key Decisions

- **Local installs go through a local marketplace:** There is no direct `./path` install. Local plugins must first be registered as a marketplace source (`crunes marketplace add ./path`), then installed via `crunes plugin install <marketplace>@<plugin>`. For local-type marketplace sources, the plugin source directory is used as-is — no copy is made — so changes to the plugin files take effect immediately without reinstall. This unifies the resolution contract: all installs go through marketplace resolution regardless of source.

- **Composite `marketplace@name` registry keys prevent silent shadowing:** If two plugins from different marketplaces share a bare name, bare-name resolution throws rather than guessing. The user is shown all matching full keys and instructed to use the qualified form. This keeps plugin resolution deterministic and auditable.

- **`consentedPermissions` is per-rune, not per-plugin:** The consent snapshot is keyed by rune name inside the plugin. Adding a new rune to a plugin's manifest counts as a new permission boundary — it triggers re-consent even if all existing runes are unchanged. This reflects the security model: each rune's capability set is independently approved.

## Gotchas & Debugging

- **`plugin.json` must live at `.crunes-plugin/plugin.json`, not the repo root:** The manifest validator looks for it at that specific subpath. A `plugin.json` at the root is silently ignored — the install will fail with "manifest not found" rather than using the wrong file.

- **`@plugin/**` auto-grant resolves to the plugin cache dir, not the project dir:** Plugin runes always receive read access to their own installation directory without declaring it. A plugin rune that tries to read project files fails unless it explicitly declares `fs.read:./**`. Debugging this is subtle — the rune runs without error, but reads from project paths silently return nothing.

- **Plugin rune lifecycle must export `run(args)`, not `use(args)`:** The runtime checks for the `run` export. Any rune still using the old `use` signature fails at execution time with "Rune does not export a run() function." This is not detected at install time — only when the rune is actually invoked.
