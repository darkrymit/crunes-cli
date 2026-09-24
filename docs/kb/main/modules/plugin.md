---
type: module
title: plugin
description: Plugin lifecycle against two storage layers — a machine-wide registry recording what is installed and consented to, and a per-project map recording what is enabled here.
tags: [module, plugin, consent]
resource: src/plugin/
---

# plugin

Install, uninstall, enable, disable, update and scaffold. The model — composite keys, consent snapshots, install-once-enable-per-project — is [a shared concept](kb:crunes-main/concepts/plugin.md); this document covers how the module implements it.

## Two layers

**`<store>/plugins.json`** records every plugin installed on the machine: where its files live, which version, and the permission patterns the user consented to.

**The project's `plugins` map** records which of those are enabled here, as `{"marketplace@name": true}`.

Installing writes both. Uninstalling removes from both. The map form is what allows a project to set `false` against a plugin a global config layer enabled — see [core's merge rules](/modules/core.md).

## Local installs go through a local marketplace

There is no `crunes plugin install ./path`. A local plugin is registered as a marketplace first, then installed by `marketplace@name`.

This keeps **one resolution contract** rather than two: every install, from every source, resolves through a marketplace index. For a local-type source the plugin directory is used in place with no copy, so edits take effect with no reinstall — which is the development loop this buys.

## Consent is a snapshot and a diff

Every approved pattern is stored at install. On update the new manifest is diffed against that snapshot and **only new or escalated patterns are shown**; already-approved ones are never re-asked.

The snapshot is keyed **per rune, not per plugin**. Adding a rune to a plugin is a new capability boundary and triggers consent even when every existing rune is untouched.

The trade is against consent fatigue: a user re-approving an unchanged list on every patch release stops reading it, and a prompt nobody reads protects nothing.

## Gotchas

**The manifest must be at `.crunes-plugin/plugin.json`.** A `plugin.json` at the repository root is not found and not warned about; the install fails with *manifest not found* rather than naming the file it ignored.

**`@plugin/**` resolves to the plugin's install directory, not the project.** Plugin runes get that read grant automatically. One that tries to read project files without declaring `fs.read:./**` **does not error** — the read returns nothing and the rune carries on with empty data. This is the subtlest failure in the plugin system.

**A rune must export `run`, and this is not checked at install.** A plugin still exporting the old `use` signature installs cleanly and fails at first invocation with *Rune does not export a run() function*.

**Bare plugin names resolve against the project first.** A bare name is matched against the plugins enabled here before a global ambiguity error is raised, so a same-named plugin installed elsewhere on the machine does not block resolution. Genuine ambiguity still refuses and prints the qualified forms.
