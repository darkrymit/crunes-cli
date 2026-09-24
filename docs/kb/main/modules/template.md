---
type: module
title: template
description: Rune scaffolds resolved through a priority chain of project config, shortcut entries and plugins — where creating registers a template and applying turns one into a runnable rune.
tags: [module, template, scaffolding]
resource: src/template/
---

# template

A template is a rune scaffold: a `.js` file copied into place and registered so it can run.

**Submodules:** `commands/` — `list`, `apply`, `create`.

## Create and apply are different operations

**`template create`** adds an entry to `config.templates`. Nothing becomes runnable. The template does not appear in `crunes list`.

**`template apply`** copies the file and writes an entry under `config.runes`, making it runnable immediately.

Keeping them apart is what stops the rune list filling with scaffolds nobody has adopted yet.

## Resolution is a priority chain

Project config is consulted first, then installed plugins. A `source:` prefix skips project config and goes straight to the named source.

That order gives a project control of its own template namespace: a local entry may deliberately shadow a plugin template of the same name, and `source:plugin:name` still reaches the shadowed one.

**A shortcut entry bridges the two.** A project entry carrying a `plugin` field instead of a path means *when someone applies this alias, use that plugin's template* — and it may override the name and description, so users see the project's vocabulary rather than the plugin author's. Shortcuts resolve at apply time, not at list time.

## Metadata cascades

A template may declare a name, description and permissions. On apply these become the new rune's defaults, overridden by `--name` and `--description`. `--as <key>` sets the rune key independently of the template name.

The config write uses a temp-file rename, so an interrupted apply leaves the previous config intact. The entry **replaces** any existing one with the same key — there is no merge of existing permissions or vars, which is what makes apply idempotent and predictable.

## Gotchas

**A plugin template in a non-standard location must declare its `path`.** The default source is `<pluginDir>/templates/<key>.js`. A plugin storing templates elsewhere without declaring the path fails apply with `ENOENT` — confusing, because the template *does* appear in `crunes template list`.

**Apply overwrites without asking outside a TTY.** In a terminal it prompts when the rune file exists. With `--yes`, or in any non-TTY environment such as CI or an agent, it proceeds. The config entry is overwritten unconditionally in every case.

**An ambiguous bare template name exits 1.** Matching templates in two or more plugins prints every source rather than choosing. Disambiguate with `pluginName:templateName`.

**A shortcut's `plugin` field takes a bare name and can be ambiguous too.** Two plugins from different marketplaces sharing a bare name make the shortcut throw; use the full `marketplace@name:templateKey` form.

**`--as` moves the key and the default path together.** The file defaults to `.crunes/runes/<outputKey>.js`, so `--as other` changes both. Use `--path` to set the file independently.
