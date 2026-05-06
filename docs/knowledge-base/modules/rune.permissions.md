---
tags: [module]
---
# rune/permissions

> Permission computation: maps rune config and project overrides into an effective allow/deny set checked before every I/O operation.

**Source:** `src/rune/permissions/`
**Related:** [[modules/rune.isolation]], [[modules/rune]]

## Overview

`computeEffectivePermissions` is called once per rune run. It merges: plugin-declared permissions (from `plugin.json`) → project overrides (from `.crunes/config.json`) → auto-grants (e.g. `@plugin/**` for plugin runes). The result is a flat `{ allow, deny }` pair of micromatch-compatible patterns used by `makePermissionChecker` to gate every utils call.

`permissions-http.js` and `permissions-env.js` implement custom matchers for `fetch:` and `env:` tokens because they have structured sub-patterns (URL prefix for fetch, `<source>:<key-glob>` for env) that micromatch alone cannot handle.

## Key Decisions

- **Lifecycle namespacing is mandatory:** Permissions in `plugin.json` or `.crunes/config.json` must be declared under a lifecycle key: `{ "use": { "allow": [...] } }`. A flat top-level `{ "allow": [...] }` produces an empty permission set silently. This was the root cause of a real bug where plugin runes appeared to have no permissions despite correct `plugin.json` authoring.

- **Project allow replaces plugin allow; project deny merges:** `projectPerms?.allow ?? pluginAllow` means a project that sets `allow` replaces the plugin's list entirely. This lets projects restrict plugins. Plugin deny always unions with project deny — neither can remove the other's deny entries.

- **`@plugin/**` auto-grant:** When executing a plugin rune, `fs.read:@plugin/**` (resolved to the plugin cache dir) is always injected into effective allow. Plugin runes can always read their own bundled files without declaring it in `plugin.json`.

## Gotchas & Debugging

- **`normalizePermission` prepends `./`:** `fs.read:package.json` is normalized to `fs.read:./package.json`. A permission declared as `fs.read:./package.json` and a check for `package.json` (without `./`) will NOT match. Always use the normalized path in permission tokens.

- **`fetch:` and `env:` use custom matchers, not micromatch:** Do not add fetch or env patterns to the micromatch allow array branch. They are checked by `matchFetchPermission` and `matchEnvPermission` before the micromatch pass.

- **Shell permission matching is exact-prefix, not glob:** `shell:git log *` allows `git log --oneline -10` but not `git status`. The pattern is matched as a prefix against the full command string. The `*` is a literal wildcard only for trailing characters.
