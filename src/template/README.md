# template

Rune template management: list available templates from local config or installed plugins, apply a template to scaffold a new rune, or create a new template file and register it. Full docs: `docs/knowledge-base/modules/template.md`

## Files

- **commands/list.js** — `handler({ source, format, plain, projectRoot })` — lists templates from project config or a specific plugin, in md/json/plain format.
- **commands/apply.js** — `handler({ ref, key, path, name, description, yes, projectRoot })` — copies a template to the project and registers it as a rune in config. `resolveTemplate(sourceName, templateName, projectRoot)` — resolves a template from project shortcuts or plugins.
- **commands/create.js** — `handler({ name, path, templateName, description, yes, projectRoot, configRoot })` — creates a new template file and registers it in project config. `templateStub(name)` — generates a template rune code stub.

## Related Modules

- `core` — `loadConfig` provides the project's local template registrations.
- `plugin` — `loadRegistry` and `loadPluginJson` are used to discover templates from installed plugins.
- `shared` — `output` is used for error and success reporting.
