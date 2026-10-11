---
type: module
title: rune
description: Key resolution, isolate execution, the utils API and permission enforcement — everything between a rune key on the command line and the sections it returns.
tags: [module, rune, sandbox, permissions]
resource: src/rune/
---

# rune

The largest module, and the one every other exists to serve. It resolves a key, computes the effective permission set, builds an isolate, evaluates the rune, and collects what it returns.

**Submodules:** `isolation/` (isolate lifecycle and the utils bridge), `api/` (the host-side implementation of every `@utils` namespace), `permissions/` (effective-set computation and per-call checkers), `commands/` (`run`, `repl`, `list`, `create`, `benchmark`).

## Key resolution

Three tiers, first match wins:

| Form | Behaviour |
|---|---|
| `local:key` | project config only, plugin lookup skipped entirely |
| `plugin:name` | resolved directly against the global registry |
| `key` | project config first, then every enabled plugin |

A bare key matching runes in two enabled plugins **throws and lists the qualified forms** rather than picking one. Silent shadowing would make it impossible to say which code actually ran, which matters more here than convenience because one of the candidates may be a stranger's.

A config entry carrying a `plugin` field instead of a `path` is an alias: it re-dispatches to that plugin rune, optionally overriding its permissions and variables at the alias.

## Permissions

Effective permissions are the merge of plugin declarations, project overrides and auto-grants, flattened into allow and deny sets. The model itself is [a shared concept](kb:crunes-main/concepts/permission.md); what this module owns is how the set is computed and checked.

**Patterns are expanded into sibling forms at checker build time.** For `fs.*`, `cache.*` and `sqlite.*`, one written pattern becomes every equivalent spelling — relative, bare, absolute, `@project/`-prefixed, virtual-token — so a runtime value matches regardless of which form the rune author passed. Raw values then go straight to `checkPermission` with no normalisation at the call site, which is what keeps every call cheap and every check identical.

The expansion has one deliberate exception: a `./**` pattern does not emit its bare `**` sibling, because `./**` means *within the project* and `**` means *anywhere including absolute paths*, and collapsing the two would silently widen every repo-scoped grant.

**Project `allow` replaces; `deny` always unions.** Replacement is what lets a project restrict a plugin rather than only extend it. Union on deny preserves a most-restrictive invariant no layer can weaken.

**Plugin runes get `fs.read:@plugin/**` automatically** and nothing else. A plugin rune reading a project path without declaring it does not error usefully — the read simply returns nothing, which is the subtlest failure in this module.

## Child processes, not in-process calls

`rune.exec`, `rune.spawn` and `rune.job.start` always spawn a child with its own isolate and its own permission context. They never run in-process.

Without `repl: true` the child is `crunes run <key>` and needs `rune.run:<key>`; with it the child is `crunes repl <key>` and needs `rune.repl:<key>`. The two are distinct grants because a session is a materially larger thing to hand out than a single call.

Because children are separate processes, **they do not share the parent's call stack**, so circular detection does not span them. Within one process the chain is tracked and a repeated key throws `CircularRuneError` formatted as `release → m → release`.

## Decisions folded here

**The section filter runs after execution, not inside the isolate.** `key[-s name]` matches against returned section names once the rune has finished. A rune may still filter internally for performance, but the full result is computed when it does not, so the filter can never change what a rune would have produced.

**`$__hostRequire` is deleted after evaluation, not before.** The built-in modules need it while they resolve each other during evaluation; rune code that runs later must not have it. Removing it earlier breaks the builtins, leaving it is a sandbox escape. See [the isolate boundary](/patterns/sandbox-isolation.md).

**Results are normalised to an array.** `null` becomes `[]`, a single object becomes `[obj]`, arrays pass through — so every downstream renderer handles one shape.

## Gotchas

**A flat `allow` is rejected, not ignored.** `{ "permissions": { "allow": [...] } }` fails validation at config load, naming the rune. A grant with no lifecycle has no meaning, and dropping it silently would leave a rune mysteriously unable to read anything.

**`repl` does not inherit from `run`.** A rune doing the same work in both modes declares the grant twice.

**Shell grants are per command position.** `git log | head -20` needs two grants, redirects need `fs.*` grants, and unscannable constructs are refused outright with no grant that overrides it. `crunes shell explain '<cmd>'` is the intended first move on a denial — the full rule is in [the permission concept](kb:crunes-main/concepts/permission.md).

**A denial names the grant and where to put it.** `run` and `repl` append the config entry that resolves it, scoped to the lifecycle actually invoked. Before that existed, the error gave an exact token and no indication of which file, rune entry or lifecycle block it belonged in, which was a dead end for anyone who did not already know the config shape.

**`fs.glob` grants are matched by equality, not as globs.** This is the costliest trap in the permission system and has [its own page](/gotchas/glob-grants-match-exactly.md).

**The two matchers are not interchangeable.** `isGlobMatch` stops `*` at `/` and is correct for paths and URLs; `isWildcardMatch` lets `*` cross slashes, spaces and commas and is correct for shell commands, rune keys, env names and store names. Using the path matcher on a shell command silently refuses every command containing a slash. See [shared](/modules/shared.md).

**Help lives on `rune`, and there is no `help` namespace.** `rune.helpText(path?)` and `rune.helpSection(path?)` render the command index with no argument, or one subcommand when passed `args.$command`. An unresolvable path throws. The older `help.text()` / `help.section()` import no longer exists.

## Authoring reference

The lifecycle exports a rune may declare — `args`, `run`, `repl`, `argsRepl`, `inputRepl`, `bannerRepl`, `commandsRepl`, `completeInputRepl`, `disposeRepl` — are documented by the CLI itself and are deliberately not restated here:

```
crunes docs run          # the run(args) export
crunes docs repl         # the repl(args) export
crunes docs args         # the args(builder) schema
crunes docs utils        # every @utils namespace
```

Those pages are generated from the TypeScript declarations, so they describe the installed version. A copy here would describe whichever version it was written against — the same reasoning as [skills state no API surface](kb:crunes-main/decisions/skills-state-no-api.md).
