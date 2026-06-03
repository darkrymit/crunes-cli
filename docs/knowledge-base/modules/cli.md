---
tags: [module]
---
# cli

> Entry point bootstrap: Node 20+ snapshot re-spawn, `-v` flag disambiguation, and Commander program registration with lazy-loaded action handlers.

**Source:** `src/cli/`
**Submodules:** `commands/` (version, doctor, completions)
**Related:** [[modules/shared]], [[modules/rune]], [[modules/plugin]], [[modules/marketplace]], [[modules/template]], [[modules/cache]], [[modules/sqlite]], [[modules/docs]]

## Overview

`cli.js` runs as the process entry point and performs two mutations on the JavaScript runtime before Commander takes control. First, it detects whether the current Node.js version is 20 or higher without the `--no-node-snapshot` flag and, if so, spawns itself as a child process with that flag — the parent exits immediately and the child continues execution. This re-spawn exists because `isolated-vm` (used later in the rune sandbox) is incompatible with V8's startup snapshot mechanism, and the flag must be set before any module loads that library. Second, `cli.js` detects whether a subcommand name appears in the argument list and, if it does, rewrites any `-v` flag to `--verbose` before command parsing. This prevents Commander's automatic `-v, --version` binding from intercepting what the user intended as a verbosity flag.

All command action handlers use lazy `await import(...)` to load their implementation modules. This keeps the CLI startup time fast by avoiding unnecessary module initialization, but it means parse errors in handler modules do not surface until the exact moment someone invokes that command — they are not caught during the initial argument parse phase.

The `--cwd` and `--ccd` flags are independent overrides. `--cwd` changes where the project root is located for loading `.crunes/config.json` and resolving local runes. `--ccd` overrides where the config directory itself lives, enabling monorepo setups where a shared config sits in a parent directory while each package is its own project root. The `preAction` hook calls `configureOutput({ plain, verbose })` once before any command executes — this is the single point where `--plain` and `--verbose` take effect globally across the entire process.

## Submodules

- **`commands/version`** — prints the current package version and checks for available updates.
- **`commands/doctor`** — runs diagnostics on the crunes environment and reports dependency or configuration issues.
- **`commands/completions`** — generates and installs shell completion hooks for bash, zsh, fish, and PowerShell.

## Concepts

**Node 20+ re-spawn invariant:** If the process is running on Node.js 20 or higher and `--no-node-snapshot` is absent from `process.execArgv`, `cli.js` spawns the same command with the flag prepended and exits with the child's exit code before any module in the lazy-load chain is imported. This guarantees `isolated-vm` always runs in a process where the snapshot is disabled.

**`-v` rewrite rule:** The `-v` flag is only rewritten to `--verbose` when a subcommand name (something that does not start with `-`) appears at position `[2]` in `process.argv`. Running `crunes -v` alone still prints the version; running `crunes run -v` rewrites before parsing occurs. A command starting with `--some-flag` would not trigger the rewrite because the check for a subcommand fails.

**`--batch` opt-in:** The `-b` or `--batch` flag on the `run` command changes how `+` characters in the rune argument are interpreted. Without `-b`, `+` is a literal rune argument. With `-b`, each `+` acts as a segment boundary separating independent rune invocations. This opt-in design prevents runes that legitimately use `+` in their own argument space from breaking.

**`docs` as a command group:** The `crunes docs` group has 6 subcommands: `rune`, `utils`, `globals`, `intro`, `args`, and `run`. The `run` subcommand documents the `run(args)` function that rune authors write — it is not about the `crunes run` CLI command. Confusing the two is common.

## Key Decisions

- **Re-spawn happens in the module body, not in a hook:** The `--no-node-snapshot` re-spawn fires as synchronous code before Commander parsing and before any lazy imports. This ensures the parent process never loads `isolated-vm` in a snapshot-enabled state. An alternative — detecting the problem later and exiting with an error — would force users to manually retry, making the fix invisible. Immediate re-spawn is transparent to users.

- **All handlers use lazy imports, not eager requires:** Every `.action()` in `program.js` uses `const { handler } = await import('...')` rather than loading the module at the top level. This keeps startup time low. The trade-off is that syntax errors and circular dependencies in those modules are not caught at startup — they only surface when the command fires. This favors perceived performance over early error detection.

- **`spawnSync` exit status defaults to 1 on null:** `process.exit(result.status ?? 1)` handles the case where `spawnSync` returns `null` for the status (signal-killed child). Defaulting to `1` rather than `0` ensures error states propagate visibly to the caller.

## Gotchas & Debugging

- **The re-spawn shows as a double process on Node 20+:** Every `crunes` invocation briefly shows as two processes in `ps` or process monitors. The parent spawns the child, the child does the real work, and the parent exits. All output and errors come from the child. This is expected and harmless, but can be confusing when profiling or debugging.

- **`-v` rewrite only applies when a command is present:** `crunes -v` (with no subcommand) does not rewrite the flag, so Commander prints the version. `crunes run -v` rewrites it to `--verbose`. A hypothetical invocation like `crunes --config=/path -v` has `--config=/path` at position `[2]`, which starts with `-`, so the subcommand check fails and `-v` stays as `--version`.

- **`projectRoot()` does not cache the working directory:** The function reads `program.opts().cwd` at call time. If a test or unusual execution path changes the working directory between option parsing and the time a handler calls `projectRoot()`, the handler sees the new directory. Rarely a problem in normal CLI use but can surface in test scenarios.

- **`completions install` can duplicate on format changes:** The install subcommand checks for its exact hook line before appending to shell profiles. If a user manually reformatted the line, a second invocation appends a duplicate because the exact-string check fails.
