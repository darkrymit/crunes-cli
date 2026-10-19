---
okf_version: "0.2"
kb: crunes-cli
kb_version: "0.2"
---

# crunes-cli knowledge base

The runtime: how a rune key becomes an isolate, what each module under `src/` owns, and the traps found while building it.

## Categories

* [Modules](/modules/) - One page per top-level directory under src/: its responsibility, the boundary it defends and the state it owns.
* [Flows](/flows/) - What the CLI does, in order, from a command's arguments to its result.
* [Patterns](/patterns/) - Rules all CLI code follows.
* [Decisions](/decisions/) - Forks in how the CLI is built and run, each recorded once with what was traded away.
* [Gotchas](/gotchas/) - Non-obvious traps in building and running the CLI, each with its evidence.
