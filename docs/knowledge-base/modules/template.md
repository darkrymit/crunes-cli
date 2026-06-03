---
tags: [module]
---
# template

> Rune template management: list available templates from project config or installed plugins, scaffold a rune from a template, and register a new template.

**Source:** `src/template/`
**Submodules:** `commands/` (list, use, create)
**Related:** [[modules/core]], [[modules/plugin]], [[modules/shared]]

## Overview

A template is a rune scaffold — a `.js` file that can be copied into `.crunes/runes/` and registered in config as a starting point. Templates have three sources: local config entries (`config.templates.<key>` with a `path` field), plugin template directories (`<pluginDir>/templates/<key>.js`), and shortcut entries in config that delegate to a plugin template (`config.templates.<key>` with a `plugin` field).

`crunes template apply <template>` resolves the template, copies the file to the project, and writes the rune entry into `.crunes/config.json`. `crunes template create` creates a new blank template file and registers it in the local project config.

## Concepts

**Template resolution (`resolveTemplate`):** Priority mirrors rune key resolution — local config first (`config.templates[templateName]`), then plugin auto-discover. An explicit `source:` prefix narrows the search (`local:name` → project config only, `pluginName:name` → specific plugin). Returns a typed resolution object: `{ type: 'local'|'shortcut'|'plugin', ... }`.

**Shortcut entries:** A config entry `{ plugin: "pluginBareName:templateKey" }` is a shortcut — it points to a plugin template. The shortcut is resolved at `template apply` time: `resolvePluginKey` looks up the plugin in the global registry, then `loadPluginJson` finds the template metadata. Shortcuts are not expanded at `template list` time.

**Config write in `template apply`:** After copying the template file, the handler reads `.crunes/config.json`, merges `{ path, name?, description?, permissions? }` under `config.runes[outputKey]`, and writes back via atomic temp-file rename (`configPath + '.tmp'` → `configPath`). If the key already exists, it is overwritten without backup.

**Template metadata cascade:** The template's `plugin.json` (or local config entry) can declare `name`, `description`, and `permissions`. These become the config entry defaults. CLI flags `--name`, `--description` override them. `--as <key>` sets the rune key (default: template name).

## Flows

- [[flows/template-apply]] — full resolution chain (local → shortcut → plugin), file copy, metadata merge, config write

## Key Decisions

- **Plugin template paths default to `<pluginDir>/templates/<key>.js` but are overridable:** `use.js` constructs the source path as `path.join(pluginEntry.path, meta?.path ?? \`templates/${templateName}.js\`)`. A plugin can override the path via a `path` field in its template metadata in `plugin.json`. Without that field, the default `templates/<key>.js` is used and a plugin that stores templates elsewhere will fail with `ENOENT`.

- **`template apply` overwrites the rune config entry unconditionally (in non-interactive mode):** In TTY mode it prompts for overwrite confirmation if the rune file already exists. With `--yes` or in a non-TTY environment, it proceeds without confirmation. The config entry is always overwritten — there is no merge of existing permissions or vars.

- **`template create` registers only in local project config:** The created template is added to `config.templates` of the current project's `.crunes/config.json`. It is not available in other projects unless they also configure it or it is published in a plugin.

## Gotchas & Debugging

- **Ambiguous template names across plugins exit 1 immediately:** If a bare template name matches templates in two or more installed plugins, `resolveTemplate` calls `output.error(...)` and `process.exit(1)`. Use `pluginName:templateName` to resolve the ambiguity.

- **`--as <key>` controls the rune key but not the file path independently:** The rune file defaults to `.crunes/runes/<outputKey>.js`. Using `--as other-key` changes the registration key and the default file path together. Override the file path separately with `--path` if needed.

- **Shortcut plugin resolution uses bare plugin name, not full `marketplace@name` key:** `resolvePluginKey(pluginBareName, registry)` searches the registry for a plugin whose name matches the bare name after `@`. If two plugins from different marketplaces have the same bare name, it throws `Ambiguous plugin "X". Use the full key: ...` — it does NOT silently pick one.
