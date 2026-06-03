# docs

Documentation commands: loads TypeDoc-generated JSON, walks and formats API surfaces for utils/globals, renders the full sandbox intro, and formats rune arg schemas into usage strings. Full docs: `docs/knowledge-base/modules/docs.md`

## Files

- **formatter.js** — `formatHelp(schema, runeMeta)` — formats a rune's parsed args schema into a usage string (Usage line, positionals, Options, Examples).
- **intro-compiler.js** — `compileIntro({ config, format, projectRoot, configRoot, hasProjectError })` — compiles the full Crunes ecosystem intro document: lifecycle/globals API reference, active rune list, utils namespace reference, and workspace context. Outputs text or JSON.
- **ts-walker.js** — `walk(typedocJson)` — walks TypeDoc JSON and extracts namespaces, functions, classes, and interfaces into structured IR member trees.
- **ts-formatter.js** — `formatNode(node, opts)`, `formatMembers(members, opts)` — renders IR nodes to terminal-style text: typed sig lines, desc-only Parameters block, Returns label only when documented.
- **commands/args.js** — `handler()` — outputs static help for the `args(builder)` export and builder method reference.
- **commands/globals.js** — `handler({ format })` — displays injected sandbox globals and ES2020 builtins documentation using `ts-walker` + `ts-formatter`.
- **commands/intro.js** — `handler({ global, out, format, projectRoot, configRoot })` — generates Crunes intro documentation and writes to file or stdout.
- **commands/rune.js** — `handler({ keys, format, projectRoot, configRoot })` — CLI handler for `crunes docs rune <key>`: resolves each key, loads its `args()` export via `getArgsSchema`, and writes formatted help to stdout.
- **commands/run.js** — `handler()` — outputs static help for the `run(args)` export and parsed arguments structure.
- **commands/utils.js** — `handler({ namespaces, format })` — displays utils namespace reference documentation, filtered to specific namespaces or all, using `ts-walker` + `ts-formatter`.

## Related Modules

- `rune/isolation` — `getArgsSchema` runs the rune's `args()` export inside a sandboxed isolate to extract the schema.
- `rune/permissions` — `computeEffectivePermissions` is called before `getArgsSchema` to pass the correct permission checker.
- `core` — `loadConfig` and `getRune` resolve rune entries.
- `shared` — `output` is used for error and warning reporting.
