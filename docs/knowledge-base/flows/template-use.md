---
tags: [flow]
---
# `crunes template use` Flow

> A template is resolved from one of three sources (local config, shortcut alias, or installed plugin), copied into the project, and registered as a rune in `.crunes/config.json`.

**Modules:** [[modules/template]], [[modules/plugin]], [[modules/core]], [[modules/shared]]

## Overview

`crunes template use [source:]template` parses the optional `source:` prefix, resolves the template through a priority chain (project config → plugin scan), copies the template file to `.crunes/runes/<key>.js`, and writes a rune config entry that merges template metadata with any CLI flag overrides. The result is a new locally-owned rune ready to run with `crunes use <key>`.

## Walkthrough

```
crunes template use [source:]template [--as <key>] [--path <path>] [--name] [--description]
          │
          ▼
  commands/use.js: parse [source:]template
  → if ref contains ':': sourceName = left, templateName = right
  → else: sourceName = null, templateName = ref
          │
          ▼
  resolveTemplate(sourceName, templateName, projectRoot)
          │
          ├─ sourceName is null or 'project'?
          │     → loadConfig(projectRoot)
          │     → config.templates[templateName]:
          │         string or { path }  → type: 'local'
          │         { plugin: "name:key" } → type: 'shortcut'
          │         { } (no path/plugin) → type: 'local', default path .crunes/templates/<name>.js
          │         missing + source === 'project' → return null (not found)
          │
          └─ Plugin scan (runs if no project match OR sourceName is a plugin name/key):
                → loadRegistry() → iterate enabled plugins
                → filter by sourceName if present (bare name or full marketplace@name)
                → loadPluginJson(pluginEntry.path) for each candidate
                → collect plugins where pluginJson.templates[templateName] exists
                → 2+ matches → error + exit 1 ("use source:template to disambiguate")
                → 1 match  → type: 'plugin'
                → 0 matches → return null
          │
          ▼
  not found? → error "Template not found. Run: crunes template list" + exit 1
          │
          ▼
  Determine output paths:
  outputKey    = --as flag ?? templateName
  runeRelPath  = --path flag ?? .crunes/runes/<outputKey>.js
  runeAbsPath  = projectRoot + runeRelPath
          │
          ▼
  File exists? + TTY?
  → confirm overwrite; cancel exits 0
  → non-interactive (--yes or no TTY): proceeds silently
          │
          ▼
  mkdir(dirname(runeAbsPath), { recursive: true })
          │
          ▼
  Copy template file (branch by resolution type):
          │
          ├─ type: 'local'
          │     → fs.copyFile(projectRoot/entry.path, runeAbsPath)
          │     → templateMeta = entry fields (name, description, permissions)
          │
          ├─ type: 'shortcut'
          │     → parse "pluginBareName:pluginTemplateKey" from entry.plugin
          │     → resolvePluginKey(pluginBareName, registry) — throws on ambiguity
          │     → loadPluginJson(pluginEntry.path)
          │     → templateRelPath = meta.path ?? templates/<pluginTemplateKey>.js
          │     → fs.copyFile(pluginEntry.path/templateRelPath, runeAbsPath)
          │     → templateMeta = plugin meta merged with shortcut entry overrides
          │         (shortcut's name/description take precedence over plugin's)
          │
          └─ type: 'plugin'
                → templateRelPath = templateMeta.path ?? templates/<templateName>.js
                → fs.copyFile(pluginEntry.path/templateRelPath, runeAbsPath)
                → templateMeta = pluginJson.templates[templateName]
          │
          ▼
  Build config entry:
  {
    path: runeRelPath,
    name:        --name flag ?? templateMeta.name        (omitted if neither)
    description: --description flag ?? templateMeta.description
    permissions: templateMeta.permissions                (omitted if absent)
  }
  → CLI flags override template metadata; template metadata provides defaults
          │
          ▼
  Atomic write to .crunes/config.json:
  → read existing config (or start with { runes: {} })
  → config.runes[outputKey] = configEntry
  → write to configPath.tmp, rename to configPath
          │
          ▼
  Output: "Created <runeRelPath>\nRun: crunes use <outputKey>"
```

## Error Paths

- **Template not found** — `resolveTemplate` returns null; prints "Run: crunes template list"; exits 1.
- **Ambiguous bare template name** — multiple plugins declare the same template key; `resolveTemplate` exits 1 with the list of matching sources.
- **Shortcut plugin not installed** — `resolvePluginKey` returns null; exits 1 with hint to install the plugin.
- **Shortcut template key missing from plugin** — exits 1.
- **Template file missing from plugin dir** — `fs.copyFile` throws with `ENOENT`; unhandled (propagates to top-level handler).
- **Overwrite declined (interactive)** — exits 0 with "Cancelled."

## Key Decisions

- **Project config has priority over plugins:** `resolveTemplate` checks `config.templates` first, then scans plugins. An explicit `source:template` token bypasses the project config check and goes straight to plugin resolution.

- **Shortcut metadata merge order:** For shortcut entries, the shortcut's own `name` and `description` fields (in project config) override the plugin's declared metadata. This lets projects customise the display name without editing plugin files.

- **Permissions are inherited, not blocked:** If a template declares permissions in its metadata, those are copied verbatim into the rune config entry. The user gets a ready-to-run rune with the correct permission declarations pre-filled.

- **Config write is atomic:** The `.tmp`-rename pattern ensures a partial write (e.g. process killed) never corrupts the config file.

- **`outputKey` controls both key and file path:** `--as other-key` changes both the `config.runes` key and the default file path to `.crunes/runes/other-key.js`. Use `--path` to override the file path independently.
