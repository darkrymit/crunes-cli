# template

Rune template management: list available templates from local config or installed plugins, scaffold a new rune from a template, or create a new template file and register it. Full docs: `docs/knowledge-base/modules/template.md` (pending)

## Sub-directories

- **commands/** — CLI handlers: `list`, `use`, `create`.

## Related Modules

- `core` — `loadConfig` provides the project's local template registrations.
- `plugin` — `loadRegistry` and `loadPluginJson` are used to discover templates from installed plugins.
- `shared` — `output` is used for error and success reporting across all template commands.
