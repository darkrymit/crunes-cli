# Gotchas

* [src changes need a rebuild, rune changes do not](/gotchas/dist-rebuild.md) - Editing src/ has no effect until npm run build, while rune files are read from disk at runtime — so a CLI change that appears to do nothing is almost always an unbuilt bundle.
* [Every invocation shows as two processes](/gotchas/double-process.md) - The parent re-spawns itself with --no-node-snapshot and exits, so crunes always appears twice in a process monitor and all real output comes from the child.
* [A bare temp directory is rootless](/gotchas/rootless-temp-dirs.md) - A directory with no .crunes/config.json is not a project, so local state redirects into the store — which catches tests that create a temp directory and expect state beside it.
* [Watching a Windows short path aborts the process](/gotchas/windows-short-paths.md) - libuv compares an event filename against the directory string it was given and fails a native assertion when they disagree, so watching an 8.3 short path kills the process outright rather than throwing.
