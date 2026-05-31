# docs

Rune and utils documentation commands: loads TypeDoc-generated JSON, walks and formats API surfaces, and renders the full sandbox intro. Full docs: `docs/knowledge-base/modules/docs.md`

## Key Files

- **formatter.js** — `formatHelp(schema, runeMeta)` — formats a parsed args schema into a usage string (Usage line, positionals, Options, Examples).
- **commands/rune.js** — `handler({ keys, format, projectRoot, configRoot })` — CLI handler for `crunes help <rune>`: resolves each key, loads its `args()` export via `getArgsSchema`, and writes formatted help to stdout.

## Related Modules

- `rune/isolation` — `getArgsSchema` runs the rune's `args()` export inside a sandboxed isolate to extract the schema.
- `rune/permissions` — `computeEffectivePermissions` is called before `getArgsSchema` to pass the correct permission checker.
- `core` — `loadConfig` and `getRune` resolve rune entries.
- `shared` — `output` is used for error and warning reporting.
