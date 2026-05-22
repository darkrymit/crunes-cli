---
tags: [module]
---
# cli

> Entry point bootstrap: Node 20+ snapshot re-spawn, `-v` flag disambiguation, and Commander program registration with lazy-loaded action handlers.

**Source:** `src/cli/`
**Submodules:** `commands/` (version, doctor, completions)
**Related:** [[modules/shared]], [[modules/rune]], [[modules/plugin]], [[modules/marketplace]], [[modules/template]], `src/help/`

## Overview

`cli.js` is the process entry point. It performs two mutations on process state before delegating to Commander: it re-spawns the process with `--no-node-snapshot` if running on Node ≥ 20 without the flag, and it rewrites `process.argv` to convert `-v` to `--verbose` if a subcommand is present. `buildProgram()` in `program.js` registers all commands and returns the Commander instance.

## Concepts

**Node 20+ re-spawn:** `cli.js` checks `parseInt(process.versions.node.split('.')[0], 10) >= 20 && !process.execArgv.includes('--no-node-snapshot')`. If true, it calls `spawnSync(process.execPath, ['--no-node-snapshot', ...process.argv.slice(1)], { stdio: 'inherit' })` and immediately exits with the child's status. This happens in the module body, before the lazy imports in action handlers would ever load `isolated-vm`.

**`-v` disambiguation:** Commander registers `-v, --version` on the root program. `crunes use -v` should mean `--verbose`, not print the version. `cli.js` checks `process.argv.length > 2 && !process.argv[2].startsWith('-')` to detect a subcommand, then finds and replaces the first `-v` in `process.argv` with `--verbose` before `program.parseAsync`. This rewrite is in-place on the array.

**`preAction` hook:** `program.hook('preAction', ...)` runs before every subcommand action and calls `configureOutput({ plain, verbose })`. This is the guaranteed path for applying `--plain` and `--verbose` globally — individual handlers do not need to check these flags directly.

**`projectRoot()` lazy closure:** `program.js` defines `function projectRoot()` that reads `program.opts().cwd` at call time. All command action handlers call `projectRoot()` inside the action function, not at registration time. This means `--cwd` is always resolved correctly regardless of Commander's option parsing order.

## Key Decisions

- **Re-spawn before isolated-vm loads:** `isolated-vm` is only imported lazily via `await import('../rune/commands/use.js')` inside the `use` command's action handler. The `--no-node-snapshot` re-spawn in `cli.js` fires long before any command handler runs, so the parent process never loads `isolated-vm` in a snapshot-enabled environment.

- **All command handlers are lazy imports:** Every `.action()` in `program.js` uses `const { handler } = await import('...')`. This keeps the startup parse cycle fast — only the module for the invoked command is actually loaded. Side effect: parse errors in handler modules do not surface until the command fires.

- **`help` is a command group, not a top-level command:** `crunes help rune <key>` is registered as a sub-command of the `help` group (`program.command('help')`). The handler lives in `src/help/commands/rune.js`, not `src/cli/commands/`. `crunes help --help` shows the group; `crunes help rune --help` shows the sub-command options.

- **`spawnSync` result status fallback to `1`:** `process.exit(result.status ?? 1)` handles the edge case where `spawnSync` returns `null` for the status (signal-killed child). The parent exits non-zero rather than hanging.

## Gotchas & Debugging

- **The re-spawn shows as a double process:** On Node 20+, every `crunes` invocation creates a parent that immediately exits and a child that does the real work. Process monitors, `strace`, or `ps` will show two processes briefly. All logs and errors come from the child.

- **`-v` is rewritten only when a command is present:** `crunes -v` (alone) does NOT rewrite `-v`, so Commander prints the version. `crunes use -v` rewrites it to `--verbose`. A command that starts with `-` (e.g., hypothetical `crunes --some-flag`) would have `process.argv[2].startsWith('-')` be true, so `hasCommand` is false and `-v` stays as `--version`.

- **`projectRoot()` returns `process.cwd()` if `--cwd` was not passed:** It does NOT cache `process.cwd()` at registration time. If something changes the working directory after Commander parses options but before the action handler fires (unusual but possible in tests), `projectRoot()` will return the new directory.

- **`completions install` appends idempotently to shell profiles:** The install subcommand checks if its hook line is already present before appending. However, if the profile was manually edited and the line format changed, duplicates can appear.
