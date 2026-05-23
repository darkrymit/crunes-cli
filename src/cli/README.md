# cli

Entry point and program assembly for the crunes CLI. Full docs: `docs/knowledge-base/modules/cli.md`

## Key Files

- **cli.js** — Process bootstrap: Node.js snapshot workaround, global error handlers, and `-v` flag disambiguation (verbose vs. version).
- **program.js** — Commander program factory: registers all commands and sub-command groups with their options and dynamic imports.

## Sub-directories

- **commands/** — General-purpose CLI commands: `version` (version print + update check), `doctor` (environment diagnostics), `completions` (shell tab-completion handlers and profile install).

## Related Modules

- `rune` — Provides `crunes use`, `list`, `init`, `create`, `check`, `bench` command handlers.
- `plugin` — Provides `crunes plugin *` command handlers.
- `marketplace` — Provides `crunes marketplace *` command handlers.
- `template` — Provides `crunes template *` command handlers.
- `shared` — `configure()` is called in the `preAction` hook to apply `--plain` / `--verbose`.
- `cache` — Provides `crunes cache *` command handlers.
- `sqlite` — Provides `crunes sqlite *` command handlers.
