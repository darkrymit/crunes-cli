---
tags: [module]
---
# template

> Rune template management: list available templates from project config or installed plugins, scaffold a rune from a template, and register a new template.

**Source:** `src/template/`
**Submodules:** `commands/` (list, apply, create)
**Related:** [[modules/core]], [[modules/plugin]], [[modules/shared]]

## Overview

A template is a rune scaffold — a `.js` file that can be copied into `.crunes/runes/` and registered in config as a starting point. Templates have three sources: local config entries, plugin template directories, and shortcut entries that delegate to a plugin template. The distinction between "creating" and "applying" a template is important: creating adds a template to the local config's template registry but does not make it a runnable rune; applying copies the template file and registers it under `config.runes`, making it immediately runnable.

Template resolution follows a priority chain. Project config is checked first, then plugins are scanned. An explicit `source:` prefix in the apply argument bypasses project config and goes straight to the named source. This gives projects control over their template namespace — a project can define a local `"my-template"` entry that shadows a plugin template with the same name, or use `source:plugin:my-template` to reach the plugin version explicitly.

Shortcut entries are the bridge between project config and plugin templates. A shortcut entry says "when someone applies my-alias, find this plugin's template and use it." Importantly, the shortcut can override the plugin template's name and description — so users in the project see the project's terminology, not the plugin author's. The shortcut is resolved at apply time; it is not expanded at list time.

## Concepts

**`template create` registers in `config.templates`, not `config.runes`:** A newly created template is a scaffold registered in the templates map. It becomes a runnable rune only when `template apply` copies it and writes an entry under `config.runes`. This separation keeps the rune list clean — unapplied templates don't appear in `crunes list`.

**Metadata cascade:** Templates carry optional name, description, and permission declarations. When applied, these become the defaults for the resulting rune's config entry. CLI flags (`--name`, `--description`) override the template defaults. `--as <key>` sets the rune key independently from the template name.

**Atomic config write:** After copying the template file, the handler writes to `config.runes[outputKey]` via a `.tmp`-rename pattern. If the process dies mid-write, the old config remains intact. The new entry always replaces any existing entry with the same key without merging — there is no diff or partial update.

## Flows

- [[flows/template-apply]] — full resolution chain (local → shortcut → plugin), file copy, metadata merge, config write

## Key Decisions

- **Plugin template paths default to `<pluginDir>/templates/<key>.js` but are overridable:** The apply handler constructs the source path from the plugin's metadata. If a plugin declares a `path` field in the template entry of its `plugin.json`, that path is used instead of the default. A plugin that stores templates in a non-standard location must declare this — otherwise apply fails with `ENOENT`, which is confusing because the template appears in `crunes template list`.

- **`template apply` overwrites unconditionally in non-interactive mode:** In a TTY, the handler prompts if the rune file already exists. With `--yes` or in a non-TTY environment, it proceeds without asking. The config entry is always overwritten — there is no merge of existing permissions or vars. This makes apply idempotent and predictable.

- **`template create` registers only in local project config:** The created template is added to the current project's `config.templates`. It is not shared across projects and will not appear in other projects unless they independently configure it or it is published via a plugin.

## Gotchas & Debugging

- **Ambiguous template names across plugins exit 1 immediately:** If a bare template name matches templates in two or more installed plugins, `resolveTemplate` exits 1 and lists all matching sources. Use `pluginName:templateName` syntax to resolve the ambiguity.

- **`--as <key>` changes both the rune key and the default file path together:** The rune file defaults to `.crunes/runes/<outputKey>.js`. Using `--as other-key` changes both the key and the path simultaneously. If you need to set them independently, use `--path` to override the file path while `--as` controls the key.

- **Shortcut plugin resolution uses bare plugin name, not the full `marketplace@name` key:** If two plugins from different marketplaces share a bare name, the shortcut throws on ambiguity rather than guessing. Resolve this by using the full qualified key in the shortcut's `plugin` field: `{ "plugin": "marketplace@name:templateKey" }`.
