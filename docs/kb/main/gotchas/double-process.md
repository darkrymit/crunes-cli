---
type: gotcha
title: Every invocation shows as two processes
description: The parent re-spawns itself with --no-node-snapshot and exits, so crunes always appears twice in a process monitor and all real output comes from the child.
tags: [node, bootstrap, debugging]
resource: src/cli/cli.js
---

# Every invocation shows as two processes

On Node 20 and above, `crunes` spawns itself with `--no-node-snapshot` and the parent exits — see [the re-spawn decision](/decisions/node-snapshot-respawn.md). Both processes are briefly visible in `ps`, Task Manager or a profiler.

This is expected and harmless, and it misleads in three specific places:

**Profiling.** Attaching to the first `crunes` pid measures a process that does nothing but wait. The work is all in the child.

**Signals.** A signal sent to the parent is not automatically delivered to the child, because the parent is a thin wrapper rather than a process group leader.

**Exit status.** The status is the child's, forwarded. A signal-killed child yields `null`, which is deliberately mapped to `1` rather than `0`, so an abnormal death is never read as success.
