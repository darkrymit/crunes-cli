---
type: decision
title: Re-spawn for --no-node-snapshot
description: The entry point re-spawns itself with --no-node-snapshot before any module loads, because isolated-vm cannot run under V8's startup snapshot and the flag has to be set before the library is imported.
tags: [isolated-vm, node, bootstrap]
resource: src/cli/cli.js
---

# Re-spawn for `--no-node-snapshot`

`isolated-vm` is incompatible with V8's startup snapshot. On Node 20 and above the snapshot is on by default, and the flag that disables it must be set **before the process starts** — it cannot be turned on from inside a running process, and by the time `isolated-vm` is imported it is far too late.

So `cli.js` checks whether `--no-node-snapshot` is in `process.execArgv` and, if it is not, spawns itself with the flag prepended and exits with the child's status.

## Why in the module body

The re-spawn is synchronous code in the module body, before Commander is constructed and before any lazy `import()` resolves. It has to be: the guarantee wanted is that **the parent process never loads `isolated-vm` at all**, and any hook that runs later already sits after some import chain that might reach it.

## Why not just fail with a message

Detecting the condition and exiting with *re-run me with this flag* would work, and it would make the fix the user's problem on every single invocation. A CLI whose documented usage is `node --no-node-snapshot $(which crunes)` is not a CLI anyone wants. Re-spawning costs one process launch and is invisible.

## What it costs

**Every invocation is two processes.** The parent spawns the child and exits; all output, all errors and the real exit status come from the child. In `ps`, a profiler, or a process monitor, `crunes` briefly appears twice. This is expected, and it surprises everyone who sees it the first time — see [the double process](/gotchas/double-process.md).

**Signal handling goes through the parent.** The parent is a thin shell waiting on the child, so a signal delivered to it is not automatically the same as one delivered to the child.

**A null exit status defaults to 1.** `spawnSync` returns `null` for a signal-killed child, and `process.exit(result.status ?? 1)` deliberately treats that as failure rather than success, so an abnormal termination cannot be read as a clean run.
