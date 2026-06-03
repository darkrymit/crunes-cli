# cli

Entry point and program assembly for the crunes CLI. Full docs: `docs/knowledge-base/modules/cli.md`

## Files

- **cli.js** — Process bootstrap: Node.js snapshot workaround, global error handlers, and `-v` flag disambiguation (verbose vs. version). Imports `buildProgram` and calls `.parseAsync(process.argv)`.
- **program.js** — `buildProgram()` — builds and returns the complete Commander.js CLI program with all subcommands and option groups registered via dynamic imports.
- **commands/version.js** — `handler({ check, plain })` — prints the installed version and optionally checks for npm updates (result cached with TTL).
- **commands/doctor.js** — `handler({ projectRoot })` — verifies environment health: Node.js version, crunes in PATH, and project config validity.
- **commands/completions.js** — `resolveCompletions(tokens, program, opts)` — resolves shell completion candidates from CLI tokens. Shell-specific handlers: `zshHandler`, `fishHandler`, `powershellHandler`, `bashHandler`. `installHandler(shell, opts)` — appends a completion hook to the shell profile idempotently.

## Related Modules

- `rune` — Provides `run`, `list`, `create`, `check`, `benchmark` command handlers.
- `plugin` — Provides `crunes plugin *` command handlers.
- `marketplace` — Provides `crunes marketplace *` command handlers.
- `template` — Provides `crunes template *` command handlers.
- `cache` — Provides `crunes cache *` command handlers.
- `sqlite` — Provides `crunes sqlite *` command handlers.
- `docs` — Provides `crunes docs *` command handlers.
- `shared` — `configure()` is called in the `preAction` hook to apply `--plain` / `--verbose`.
