---
tags: [flow]
---
# `crunes plugin install` Flow

> A plugin is resolved from a marketplace, downloaded or linked, validated, consented to, and registered in both the global store and the project config.

**Modules:** [[modules/plugin]], [[modules/marketplace]], [[modules/core]], [[modules/shared]]

## Overview

`crunes plugin install <marketplace>@<plugin>` parses the argument into marketplace and plugin names, resolves the source URL from the marketplace index, downloads (or symlinks) the plugin, validates its manifest, prompts the user for permission consent, and writes the result to both the global plugin registry (`~/.crunes/plugins.json`) and the project config (`.crunes/config.json`). If the plugin is already installed, the update path runs instead — diffing permissions and re-consenting only for changes.

## Walkthrough

```
crunes plugin install <marketplace>@<plugin>
          │
          ▼
  commands/install.js: parseInstallArg → [marketplaceName, pluginName]
  (error + exit 1 if no @ in argument)
          │
          ▼
  marketplace/marketplace.js: resolveFromMarketplace(marketplaceName, pluginName)
  → looks up marketplace in ~/.crunes/marketplaces.json
  → fetches marketplace index (cached for github/npm; live for http/local)
  → returns { resolvedSource, marketplaceName, pluginName }
          │
          ▼
  plugin/install.js: installPlugin(resolvedSource, projectRoot, provenance)
          │
          ├─ provenance.marketplaceName missing? → throw (direct installs blocked)
          │
          ├─ ensureStoreDirs() — create ~/.crunes/plugins/ etc. if absent
          │
          ├─ classifySource(source) → { type, resolved }
          │     'local'  — path starts with ./ / ~/ / absolute
          │     'github' — owner/repo or github: prefix → GitHub tarball API
          │     'git'    — https:// or git+ URL → git clone --depth=1
          │     'npm'    — everything else → npm pack
          │
          ├─ Staging:
          │     local  → stagingDir = path.resolve(source)  (no copy, no cleanup)
          │     remote → stagingDir = os.tmpdir()/crunes-install-<ts>
          │               → download into stagingDir
          │               → finally: rm stagingDir (even on error)
          │
          ├─ loadPluginJson(stagingDir) — validate manifest, extract name/version
          │
          ├─ pluginKey = marketplaceName@name
          │
          ├─ loadRegistry() → check if pluginKey already present
          │     ↳ already installed? → updatePlugin() branch (see below)
          │
          ├─ cacheDir:
          │     local  → cacheDir = stagingDir (source dir is live)
          │     remote → cacheDir = ~/.crunes/plugins/<marketplace>/<name>@<version>
          │               → fs.cp(stagingDir, cacheDir, { recursive: true })
          │
          ├─ installDeps(cacheDir, pluginJson.dependencies)
          │     → npm install --prefix cacheDir if dependencies present
          │
          ├─ promptConsent(pluginJson) — show all declared permissions
          │     declined? → rm cacheDir (remote only) → return { installed: false }
          │
          ├─ Build consentedPermissions: { [runeKey]: allowPatterns[] }
          │     (flattened across all lifecycle keys per rune)
          │
          ├─ registerPlugin({ name, version, path: cacheDir, local, consentedPermissions, ...provenance })
          │     → writes/merges entry in ~/.crunes/plugins.json
          │
          └─ addPluginToProjectConfig(projectRoot, pluginKey)
                → reads .crunes/config.json, appends pluginKey to plugins[]
                → atomic write via .tmp rename
                → silently skips if no config.json
```

### Update branch (`updatePlugin`)

Runs when `pluginKey` is already in the registry:

```
  diffPermissions(existing.consentedPermissions, newPluginJson)
  → finds runes with new or escalated allow patterns
          │
          ├─ diff non-empty? → promptReConsent(pluginKey, diff)
          │     shows only the delta, not the full permission list
          │     declined? → return { installed: false }
          │
          ├─ Copy new version to new cacheDir (remote only)
          ├─ installDeps
          ├─ registerPlugin (overwrites existing registry entry)
          └─ addPluginToProjectConfig (idempotent — skips if already present)
```

## Error Paths

- **Missing `@` in argument** — exits 1 with format hint before any network I/O.
- **Marketplace not found / plugin not in index** — `resolveFromMarketplace` throws; cancelled with message.
- **Download fails** — `downloadGitHub`/`downloadGit`/`downloadNpm` throws; staging cleaned up; exits 1.
- **Invalid `plugin.json`** — `loadPluginJson` throws `ValidationError`; staging cleaned up; exits 1.
- **Consent declined** — remote cache dir deleted; returns `{ installed: false }`; CLI prints "Installation cancelled." and exits 0.
- **No project config** — `addPluginToProjectConfig` silently skips; plugin is still registered globally.

## Key Decisions

- **Provenance required — direct installs blocked:** `installPlugin` throws immediately if `provenance.marketplaceName` is absent. This prevents users from installing arbitrary paths without going through a marketplace, ensuring plugins are always traceable to a named source.

- **Local installs use the source dir directly:** For `./path` sources, `cacheDir = stagingDir = path.resolve(source)`. No copy is made. Changes to source files take effect immediately without reinstall. This is the development workflow for plugin authors.

- **Staging cleanup in `finally`:** Remote staging dirs are always deleted, even if install fails mid-way. Local staging dirs are never deleted (they are the source). This prevents orphaned temp dirs after errors.

- **`consentedPermissions` snapshot at install time:** The per-rune allow lists are frozen in the registry at the moment of consent. The update path compares against this snapshot to compute the diff — only new or escalated patterns require re-consent. Patterns that were already consented to never re-prompt.

- **Atomic config write:** `.crunes/config.json` is written via a `.tmp` rename. If the process dies mid-write, the old config is intact.
