# shared

General-purpose utilities with no domain coupling. Consumed by multiple feature modules. Full docs: `docs/knowledge-base/modules/shared.md`

## Files

- **output.js** — `output` logger with `header`, `success`, `error`, `warn`, `info` methods. `configure({ plain, verbose })` — sets global output mode (colored vs plain, verbose flag). `isVerbose` — exported boolean for verbose-mode checks.
- **render.js** — `render(data)` — renders a single data object (tree or markdown) to a plain string. `renderSection(section)` — renders a `Section` object to CLI markdown format with title, attributes, and rendered data.
- **match.js** — `isMatch(value, pattern)` — single micromatch wrapper with consistent options (`dot`, `noextglob`, `nonegate`, `nobrace`, `nobracket`) used everywhere glob matching occurs in the codebase.

## Related Modules

- `rune` — `run` and `check` command handlers consume `renderSection` to write rune output to stdout.
- `cli` — `program.js` calls `configure` in the `preAction` hook to apply `--plain` / `--verbose` flags.
