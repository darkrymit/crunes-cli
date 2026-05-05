# shared

General-purpose utilities with no domain coupling. Consumed by multiple feature modules. Full docs: `docs/knowledge-base/modules/shared.md` (pending)

## Key Files

- **output.js** — `output` logger (`success`, `error`, `info`, `warn`) and `configure({ plain, verbose })` — global output mode applied via the CLI `preAction` hook.
- **render.js** — `render(sections, opts)` and `renderSection(section)` — convert `Section[]` results from rune execution to formatted CLI output strings.

## Related Modules

- `rune` — `use` and `check` command handlers consume `render` to write rune output to stdout.
- `cli` — `program.js` calls `configure` in the `preAction` hook to apply `--plain` / `--verbose` flags.
