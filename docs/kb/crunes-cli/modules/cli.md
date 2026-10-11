---
type: module
title: cli
description: The process entry point — two mutations to the runtime before Commander sees anything, lazy-loaded action handlers, and the global flags that configure output once for the whole process.
tags: [module, cli, commander, bootstrap]
resource: src/cli/
---

# cli

The entry point. `cli.js` performs two mutations before Commander is constructed, then `program.js` registers every command with a lazily-imported handler.

**Submodules:** `commands/` — `version`, `doctor`, `completions`.

## Two mutations, both before parsing

**The `--no-node-snapshot` re-spawn.** On Node 20+, the process re-launches itself with the flag and the parent exits. It must happen in the module body, before any import chain can reach `isolated-vm` — see [the re-spawn decision](/decisions/node-snapshot-respawn.md).

**The `-v` rewrite.** Commander binds `-v` to `--version` automatically, which is not what someone typing `crunes run -v` means. So `-v` is rewritten to `--verbose` — but **only when a subcommand is present**, detected as a token at `process.argv[2]` not starting with `-`.

The consequence is exactly the behaviour wanted at both ends: `crunes -v` prints the version, `crunes run -v` is verbose. And one edge follows from the implementation: `crunes --config=/path -v` has a token at `[2]` starting with `-`, so the subcommand check fails and `-v` remains `--version`.

## Global flags apply once

`--plain`, `--verbose`, `--cwd` and `--ccd` are global. A `preAction` hook calls `configureOutput({ plain, verbose })` once before any command runs — the single point where colour and verbosity take effect across the whole process, so no module threads them through.

`--cwd` and `--ccd` are independent. `--cwd` moves the project root used to load config and resolve local runes; `--ccd` moves only the config directory, which is what makes a monorepo layout possible where one shared config sits above packages that are each their own root.

## Decisions folded here

**Every action handler is a lazy `await import(...)`.** Startup does not pay for the module graph of commands it is not running, which matters because the CLI is invoked repeatedly in loops by agents and scripts.

The trade is real: a syntax error or circular import inside a handler module is **not** caught when arguments are parsed. It surfaces at the moment someone runs that specific command, which can be long after the mistake was introduced. This favours perceived startup speed over early detection, deliberately.

## Gotchas

**`projectRoot()` reads the option at call time.** It does not cache. If the working directory changes between option parsing and the call, the handler sees the new one. Rare in normal use, reachable in tests.

**`completions install` can duplicate.** It checks for its exact hook line before appending to a shell profile. A line that was manually reformatted no longer matches, so a second install appends a second copy.

**The command surface is generated, not listed here.** `crunes --help` and `crunes <group> --help` are the authority for which commands and subcommands exist. A count written into a document is the copy that goes wrong — the note claiming the `docs` group had ten subcommands while listing twelve was wrong for months, which is why [the layout spec](kb:crunes-main/specs/knowledge-base.md) forbids stating a total a tool can count.
