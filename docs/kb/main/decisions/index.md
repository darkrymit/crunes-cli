# Decisions

* [Re-spawn for --no-node-snapshot](/decisions/node-snapshot-respawn.md) - The entry point re-spawns itself with --no-node-snapshot before any module loads, because isolated-vm cannot run under V8's startup snapshot and the flag has to be set before the library is imported.
* [One esbuild bundle, and runes stay on disk](/decisions/single-bundle-build.md) - The whole of src/ compiles to a single gitignored dist/cli.js, while rune files are read from disk at runtime so editing one needs no rebuild.
